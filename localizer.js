const { GoogleSpreadsheet } = require("google-spreadsheet");
const { OpenAI } = require("openai");
const { SheetsCache } = require('./sheetsHelper');
const { Semaphore, withRetry } = require("./utils");

const PARALLEL_TASKS = parseInt(process.env.PARALLEL_TASKS) || 5;
const BATCHED_LANGUAGES_SIZE = parseInt(process.env.BATCHED_LANGUAGES_SIZE) || 5;
const MAX_TEXT_LENGTH_FOR_BATCHING_LANGUAGES = parseInt(process.env.MAX_TEXT_LENGTH_FOR_BATCHING_LANGUAGES) || 300;


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_API_ORG,
});



/**
 * 
 * Calls the OpenAI API to translate the text into the specified language codes.
 * @param {String} keyName 
 * @param {String} englishText 
 * @param {Array<String>} languageCodesToTranslateTo 
 * @param {GameContext} gameContext  
 * @param {String} textContext  The context of the text, so we know in which context is the text being used
 * @returns {Promise<String>} The translated text
 */
async function localizeTexts(
  keyName,
  englishText,
  languageCodesToTranslateTo,
  gameContext,
  textContext,
  gptVersion,
  category
) {

  if (gptVersion == null)
    gptVersion = "gpt-4o";


  let featuresToKeep = {};
  //Let's remove the non used features keys from the game context
  //Lets iterate over the features

  //duplicating context object for safe deletes
  gameContext = JSON.parse(JSON.stringify(gameContext));
  for (let featureKey in gameContext.features) {
    //Now remove all the keys from  gameContext.features[featureKey] that are not in the languageCodesToTranslateTo array and is not context
    for (let languageCode in gameContext.features[featureKey]) {
      if (!languageCodesToTranslateTo.includes(languageCode) && languageCode != 'context' && languageCode != 'en') {
        delete gameContext.features[featureKey][languageCode];
      }
    }
    if (englishText.toLowerCase().trim().includes(gameContext.features[featureKey][`en`].toLowerCase().trim()))
      featuresToKeep[featureKey] = gameContext.features[featureKey];

  }


  let response = null;
  let toTranslate = JSON.stringify({
    key: keyName,
    en: englishText,
    context: textContext,
    languagesToRetrieve: languageCodesToTranslateTo,
    featureNames: featuresToKeep,
    category: category
  });
  try {
    console.log(toTranslate);
    response = await openai.chat.completions.create({
      model: gptVersion,
      response_format: { "type": "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You are a helpful assistant tasked with translating English keys into specified language codes for a video game. 
                Your translations should be accurate and context-appropriate.`
        },
        {
          role: "system",
          content: gameContext.description
        },
        {
          role: "system",
          content:
            `Respond with a JSON object in the format {"languageCode": {"key":"translatedValue", ...}}. 
          Ensure the JSON object is minified. Where key is the original localizationKey and translatedValue is the translated value.
          For example: when provided {"key":"hello","en":"Hello","languagesToRetrieve":["es"]} the response should be {"es":{"hello":"Hola"}}          
          Other example: when provided {"key":"house","en":"Garden","languagesToRetrieve":["es"]} the response should be {"es":{"house":"Jardin"}}
          Other example: when provided {"key":"jar_gift","en":"Gift","languagesToRetrieve":["es"]} the response should be {"es":{"jar_gift":"Regalo"}}`
        },
        {
          role: "system",
          content:
            `If unable to translate a key, include it in a "missing" section like this:{..., "missing":[{"key":"originalKey","languageCode":"language code with error", "reason":"explanation"}]}. 
                Provide a reason for each untranslated key.`
        },
        {
          role: "system",
          content:
            `Expect translation requests in JSON format: {"key":"localizationKey", "en":"englishText" ,"context":"contextForTheText", "languagesToRetrieve":["languageCode1", ...], "featureNames": {"featureKey":{"languageCode":"Feature Translation", ...,"context":"Context for the feature"}}}. 
                Translate the English text into the requested languages.
                Don't translate the text in "key", just the text in the "en" field. "key" field is just and identifier and might have nothing to do with the actual text.
                The actual text is in the "en" field.
                Use UTF-8 encoding for the translations.
                Use the provided context for the text, feature names and features context to provide accurate translations.
                The text might contain HTML or rich text formatting, so please ensure that the translation is accurate and preserves the formatting.
                Also it can contain string formatters like {0}, {1}, etc. Please ensure that the translation preserves the string formatters.
                Formatters also can be {%0}, {%1}, etc. Please ensure that the translation preserves the formatters event for RTL languages don't mix {0} and {%0}`

        },
        {
          role: "user",
          content: toTranslate
        },
      ],

    });
  } catch (e) {
    if (e.status == 429) {
      console.log(`Too many requests. Waiting for ${e.headers['retry-after']} seconds before retrying`);
      await sleep(e.headers['retry-after-ms']);
      return await localizeTexts(keyName, englishText, languageCodesToTranslateTo, gameContext, textContext, gptVersion, category);
    }

    throw e;
  }

  try {

    return JSON.parse(response.choices[0].message.content);
  } catch (e) {
    console.log(response.choices[0]);
    throw e;
  }
}


/**

 * @returns {Promise<GameContext>} The game context
 */
async function createGameContextFromSpreedsheet(documentId, featureSheetId, gameContextSheetId) {

  /**
   * @type {GameContext}
   */
  let gameContext = {
    description: "",
    features: {},
  };


  let sheetsCache = new SheetsCache(documentId);
  let [featureSheet, gameContextSheet] = await Promise.all([sheetsCache.getSheetById(featureSheetId), sheetsCache.getSheetById(gameContextSheetId)]);

  gameContext.description = gameContextSheet.getCell(1, 0).value;


  let header = await sheetsCache.getRow(sheetsCache.sheetGuiToName[featureSheetId], 0, 0);


  for (let i = 1; i < featureSheet.rowCount; i++) {
    let featureKey = featureSheet.getCell(i, 0).value;

    if (featureKey == null || featureKey == '')
      continue;

    let featureContext = null;
    try {
      featureContext = featureSheet.getCell(i, 0)._rawData.note;
    } catch { }
    let feature = {};
    feature.context = featureContext;

    for (let j = 1; j < header.length; j++) {

      let cell = featureSheet.getCell(i, j);

      if (cell.value == null || cell.value == '')
        continue;

      feature[getLanguageCode(header[j])] = cell.value;

    }

    gameContext.features[featureKey] = feature;
  }


  return gameContext;
}





/**
 * Translates all the missing keys in the spreadsheet.
 * @param {SheetsCache} sheetsCache  The spreadsheet the system will translate
 * @param {Number} sheetId The id of the sheet to translate
 * @param {GameContext} gameContext The context for what is being translated
 * @param {String} gptVersion The version of GPT to use
 */
async function translateSpreadsheet(sheetsCache, sheetId, gameContext, gptVersion) {
  let sheet = await sheetsCache.getSheetById(sheetId);

  if (gameContext == null)
    gameContext = { description: "", features: {} };

  let toTranslate = [];
  let header = await sheetsCache.getRow(sheetsCache.sheetGuiToName[sheetId], 0, 0);
  let keyColumnIndex = header.findIndex(x => x.toLowerCase().trim() === 'keys' || x.toLowerCase().trim() === 'key');
  let enColumnIndex = header.findIndex(x => getLanguageCode(x).toLowerCase().trim() === 'en');
  let currentContext = null;

  for (let i = 1; i < sheet.rowCount; i++) {
    let key = sheet.getCell(i, keyColumnIndex).value;
    let en = sheet.getCell(i, enColumnIndex).value;

    if (key == null || en == null)
      continue;

    try {
      currentContext = sheet.getCell(i, keyColumnIndex)._rawData.note;
    } catch (e) {
      currentContext = null;
    }
    let missingKeys = [];
    header.forEach((el, index) => {
      if (index == keyColumnIndex || index == enColumnIndex)
        return;

      let cell = sheet.getCell(i, index);
      if (cell.value == null || cell.value == '')
        missingKeys.push(getLanguageCode(el));
    });




    if (missingKeys.length > 0) {

      if (en.length <= MAX_TEXT_LENGTH_FOR_BATCHING_LANGUAGES) {
        //If not we from the missing translation , we will do them in batches, we will ask the API to translate the text in multiple languages at once
        //we need to separate the missingKeys array into multiple array of MAX_BATCHED_LANGUAGES_SIZE 
        let missingKeysBatches = [];
        for (let i = 0; i < missingKeys.length; i += BATCHED_LANGUAGES_SIZE) {
          missingKeysBatches.push(missingKeys.slice(i, i + BATCHED_LANGUAGES_SIZE));
        }


        missingKeysBatches.forEach((languaceCodes) => {
          toTranslate.push({
            key: key,
            en: en,
            languageCodesToTranslateTo: languaceCodes,
            context: currentContext,
            rowIndex: i
          });
        })


      } else {


        //If the english text is too long, we split the translation into multiple requests, instead of one request with all the languages , we will do one request per language
        //This is to avoid the OpenAI API returning an error saying that the text is too long

        missingKeys.forEach((languaceCode) => {
          toTranslate.push({
            key: key,
            en: en,
            languageCodesToTranslateTo: [languaceCode],
            context: currentContext,
            rowIndex: i
          });
        })



      }
    }
  }




  let tasks = [];

  for (let i = 0; i < toTranslate.length; i++) {
    try {

      t = async (index) => {
        let translateItem = toTranslate[i];

        console.log(`Translating (${index}) [${translateItem.key}] (${translateItem.languageCodesToTranslateTo.join(', ')})`);
        console.time(`Translating (${index}) [${translateItem.key}] (${translateItem.languageCodesToTranslateTo.join(', ')})`);
        await sleep(100 * index);//Offset the time for each request, so we don't get rate limited 
        let result = await withRetry(async () => await localizeTexts(translateItem.key, translateItem.en, translateItem.languageCodesToTranslateTo, gameContext, translateItem.context, gptVersion, sheet.a1SheetName), 3, 3000);
        console.timeEnd(`Translating (${index}) [${translateItem.key}] (${translateItem.languageCodesToTranslateTo.join(', ')})`);


        //console.log(result);
        for (let j = 0; j < header.length; j++) {
          let languageCode = getLanguageCode(header[j]);

          if (languageCode == '' || result[languageCode] == null)
            continue;



          let resultText = result[languageCode][translateItem.key];
          if (resultText == null)
            continue;
          sheet.getCell(translateItem.rowIndex, j).value = resultText;
          sheet.getCell(translateItem.rowIndex, j).backgroundColor = {red:.8, green:1, blue:.8, alpha: 1};

        }

        console.log(result);
        try {
          if (result.missing != null && result.missing.length > 0) {
            result.missing.forEach(x => {
              console.log(`[Error] [${x.key}] in (${x.languageCode}) because ${x.reason}`);
            });
          }

        } catch { }
      }

      tasks.push(t(tasks.length));

      if (tasks.length >= PARALLEL_TASKS || i == toTranslate.length - 1) {
        await Promise.all(tasks);
        await Promise.all([sheet.saveUpdatedCells(), sleep(1000)]);
        tasks = [];
      }
    } catch (e) {
      console.log(e);
      await sheet.saveUpdatedCells();
    } finally {
    }
  }



}

//Async set timeout function
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * 
 * @param {String} languageString 
 * @returns {String} The language code
 */
function getLanguageCode(languageString) {
  const match = languageString.match(/\[([^\]]+)\]/);
  return match ? match[1] : "";
}


//createGameContextFromSpreedsheet(`1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro`, 583341809, 784909874);
// translateSpreadsheet(new SheetsCache(`1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro`), 583341809, {});
//https://docs.google.com/spreadsheets/d/1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro/edit?gid=583341809#gid=
module.exports = { translateSpreadsheet, createGameContextFromSpreedsheet }
