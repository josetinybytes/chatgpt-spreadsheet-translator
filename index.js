//start dot env
require('dotenv').config();


const localizer = require('./localizer');
const spreadheetHelper = require('./sheetsHelper');
const { Command } = require('commander');
const inquirer = require('@inquirer/prompts');
//const { default: chalk } = require('chalk');

const program = new Command();


program.name('chatgpt-spreadsheet-translator');
program.description('Translates a spreadsheet into chatgpt compatible format');
program.version('1.0.0');

program.option('-s, --sheet <sheetToTranslate>', 'The id of the sheet to translate');
program.option('--game-context-document <gameContextDocument>', 'The id of the game context document');
program.option('--feature-sheet <featureSheet>', 'The id of the feature sheet');
program.option('--game-context-sheet <gameContextSheet>', 'The id of the game context sheet');
program.option(`--ignore-game-context`, 'Ignore the game context ');
program.option(`--gpt-version <gptVersion>`, 'The GPT version to use');

program.parse();

//chalk.blue('Starting translation...');


async function main() {
    let args = program.opts();
    let gameContext = null;

    console.log(args);
    if (args.ignoreGameContext == null || !args.ignoreGameContext) {

        console.log(`Obtaining game context...`);
        if (args.gameContextDocument == null) args.gameContextDocument = process.env.GAME_CONTEXT_DOCUMENT_ID_FALLBACK;
        if (args.featureSheet == null) args.featureSheet = process.env.FEATURE_SHEET_ID_FALLBACK;
        if (args.gameContextSheet == null) args.gameContextSheet = process.env.GAME_CONTEXT_SHEET_ID_FALLBACK;

        if (args.gameContextDocument != null && args.featureSheet != null && args.gameContextSheet != null) {
            try {
                gameContext = await localizer.createGameContextFromSpreedsheet(args.gameContextDocument, parseInt(args.featureSheet), parseInt(args.gameContextSheet));
            } catch (e) {
                console.log(e);
            }
        } else {
            console.log(`No game context document argument or fallback provided. Please provide a game context if you want more accurate translations.`);
        }
    }

    if (args.sheet == null) {
        console.error(`Please provide a sheet to translate.`);
        return;
    }
    let sheetUrl = args.sheet;
    let data = getDocumentIdAndGid(sheetUrl);
    if (data.documentId == null) {
        console.error(`Invalid sheet url. Please provide a valid sheet url.`);
        return;
    }
    console.log(`Translating sheet ${data.documentId} with gid ${data.gid}`);
    let sheet = new spreadheetHelper.SheetsCache(data.documentId);
    if (data.gid == null) {
        let doc = await sheet.getDocument();
        for (let { sheetId } of doc.sheetsByIndex) {
            await localizer.translateSpreadsheet(sheet, sheetId, gameContext, args.gptVersion);
        }
    }
    else {
        await localizer.translateSpreadsheet(sheet, parseInt(data.gid), gameContext, args.gptVersion);
    }
    console.log(`Translation complete.`);
}


function getDocumentIdAndGid(url) {
    const documentIdMatch = url.match(/\/d\/([^\/]+)/);
    const gidMatch = url.match(/gid=([^#&]+)/);

    const documentId = documentIdMatch ? documentIdMatch[1] : null;
    const gid = gidMatch ? gidMatch[1] : null;

    return { documentId, gid };
}


main();
//https://docs.google.com/spreadsheets/d/1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro/edit?gid=583341809#gid=583341809
//https://docs.google.com/spreadsheets/d/1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro/edit?gid=784909874#gid=784909874