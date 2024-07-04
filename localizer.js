const { GoogleSpreadsheet } = require("google-spreadsheet");
const { OpenAI } = require("openai");
const { SheetsCache } = require('./sheetsHelper');
const { Semaphore } = require("./utils");


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_API_ORG,
});




let featureNames = {
  cash: { en: "Cash", gold: "Gold" },
  gambitOfGlory: { en: "Gambit of Glory" },
};



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
  textContext
) {
  let response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
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
          `Expect translation requests in JSON format: {"key":"localizationKey", "en":"englishText" ,"context":"contextForTheText", "languagesToRetrieve":["languageCode1", ...],"featureNames":{
        }. 
                Translate the English text into the requested languages.`
      },
      {
        role: "system",
        content:
          `Expect translation requests in JSON format: {"key":"localizationKey", "en":"englishText" ,"context":"contextForTheText", "languagesToRetrieve":["languageCode1", ...], "featureNames": {"featureKey":{"languageCode":"Feature Translation", ...}}}. 
                Translate the English text into the requested languages. 
                Always use the provided translations for feature names in the appropriate language if the text contains any feature name.`
      },
      {
        role: "system",
        content:
          `The featureNames variable contains translations for feature names in the format {"featureKey":{"languageCode":"Feature Translation", ...}}. 
                Always use the provided translations for feature names in the appropriate language if the text contains any feature name.`
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
async function createGameContextFromSpreedsheet() {

  /**
   * @type {GameContext}
   */
  let gameContext = {};

  gameContext.description = `Massive warfare is a`
  gameContext.features = {};

  return gameContext;
}





/**
 * Translates all the missing keys in the spreadsheet.
 * @param {SheetsCache} sheetsCache  The spreadsheet the system will translate
 * @param {Number} sheetId The id of the sheet to translate
 * @param {GameContext} gameContext The context for what is being translated
 */
async function translateSpreadsheet(sheetsCache, sheetId, gameContext) {
  let sheet = await sheetsCache.getSheetById(sheetId);

  let toTranslate = [];
  let header = await sheetsCache.getRow(sheetsCache.sheetGuiToName[sheetId], 0, 0);
  let keyColumnIndex = header.findIndex(x => x.toLowerCase().trim() === 'keys');
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



  let semaphore = new Semaphore(10);

  let tasks = [];

  for (let i = 0; i < toTranslate.length; i++) {
    try {

      t = async () => {
        let translateItem = toTranslate[i];

        console.log(`Translating [${translateItem.key}] `);
        console.time(`Translating [${translateItem.key}] `);
        let result = await localizeTexts(translateItem.key, translateItem.en, translateItem.languageCodesToTranslateTo, { description: "", features: {} }, translateItem.context);
        console.timeEnd(`Translating [${translateItem.key}] `);


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

      tasks.push(t());

      if (tasks.length > 10) {
        await Promise.all(tasks);
        await sheet.saveUpdatedCells();
        tasks = [];
      }
    } catch (e) {
      console.log(e);
      await sheet.saveUpdatedCells();
    } finally {
    }
  }



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



//translateSpreadsheet(new SheetsCache(`1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro`), 0, {});

module.exports = {}