const { GoogleSpreadsheet } = require("google-spreadsheet");
const { OpenAI } = require("openai");
const { SheetsCache } = require('./sheetsHelper');
const { Semaphore, withRetry } = require("./utils");

const PARALLEL_TASKS = parseInt(process.env.PARALLEL_TASKS) || 5;


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
  gptVersion
) {

  if (gptVersion == null)
    gptVersion = "gpt-4o";
  let response = await openai.chat.completions.create({
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
          `Respond with a JSON object in the format {"languageCode": {"key":"translatedValue", ...}}. Ensure the JSON object is minified.`
      },
      {
        role: "system",
        content:
          `If unable to translate a key, include it in a "missing" section like this: "missing":[{"key":"originalKey", "reason":"explanation"}]. 
                Provide a reason for each untranslated key.`
      },
      {
        role: "system",
        content:
          `Expect translation requests in JSON format: {"key":"localizationKey", "en":"englishText" ,"context":"contextForTheText", "languagesToRetrieve":["languageCode1", ...], "featureNames": {"featureKey":{"languageCode":"Feature Translation", ...,"context":"Context for the feature"}}}. 
                Translate the English text into the requested languages. 
                Use the provided context for the text, feature names and features context to provide accurate translations.
                The text might contain HTML or rich text formatting, so please ensure that the translation is accurate and preserves the formatting.
                Also it can contain string formatters like {0}, {1}, etc. Please ensure that the translation preserves the string formatters.`

      },
      {
        role: "user",
        content: JSON.stringify({
          key: keyName,
          en: englishText,
          context: textContext,
          languagesToRetrieve: languageCodesToTranslateTo,
          featureNames: gameContext.features,
        }),
      },
    ],

  });

  return JSON.parse(response.choices[0].message.content);
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
      toTranslate.push({
        key: key,
        en: en,
        languageCodesToTranslateTo: missingKeys,
        context: currentContext,
        rowIndex: i
      })
    }
  }




  let tasks = [];

  for (let i = 0; i < toTranslate.length; i++) {
    try {

      t = async (index) => {
        let translateItem = toTranslate[i];

        console.log(`Translating (${index}) [${translateItem.key}]`);
        console.time(`Translating (${index}) [${translateItem.key}]`);
        await sleep(100 * index);//Offset the time for each request, so we don't get rate limited 
        let result = await withRetry(async () => await localizeTexts(translateItem.key, translateItem.en, translateItem.languageCodesToTranslateTo, gameContext, translateItem.context, gptVersion), 3, 3000);
        console.timeEnd(`Translating (${index}) [${translateItem.key}]`);


        for (let j = 0; j < header.length; j++) {
          let languageCode = getLanguageCode(header[j]);
          if (languageCode == '' || result[languageCode] == null)
            continue;



          let resultText = result[languageCode][translateItem.key];
          if (resultText == null)
            continue;
          sheet.getCell(translateItem.rowIndex, j).value = resultText;


        }
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
