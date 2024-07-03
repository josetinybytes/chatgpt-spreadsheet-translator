const { OpenAI } = require("openai");


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_API_ORG,
});




let gameContext = ``;
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

  return response.choices[0].message.content;
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

  return gameContext;
}



