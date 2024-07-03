const { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');


const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});





class SheetsCache {
    constructor(documentId) {
        this.documentId = documentId;
        /**
         * @type {Object.<string,GoogleSpreadsheet>}
         */
        this.sheets = {};
        this.sheetGuiToName = {};
    }

    async getSheetById(sheetId) {
        if (this.sheetGuiToName[sheetId]) {
            let result = await this.getSheet(this.sheetGuiToName[sheetId]);
            return result;
        }

        const doc = await this.getDocument();
        let r = await this.getSheet(doc.sheetsById[sheetId].title);
        return r;
    }

    /**
     * Gets the sheet by name, if it's not cached it will cache it
     * Also loads all the cells of the sheet
     * @param {string} sheetName 
     * @returns {Promise<GoogleSpreadsheetWorksheet>}
     */
    async getSheet(sheetName) {
        if (!this.sheets[sheetName]) {
            const doc = await this.getDocument();
            this.sheets[sheetName] = doc.sheetsByTitle[sheetName];
            this.sheetGuiToName[this.sheets[sheetName].sheetId] = sheetName;
            await this.sheets[sheetName].loadCells();
        }
        return this.sheets[sheetName];
    }

    async getDocument() {
        if (!this.document) {
            const doc = new GoogleSpreadsheet(this.documentId, serviceAccountAuth);
            await doc.loadInfo();
            this.document = doc;
        }
        return this.document;
    }


    /**
     * 
     * @param {*} sheetName 
     * @param {*} startRow 
     * @param {*} startColumn 
     * @returns {Promise<Array<(string|Number|Boolean)>>}
     */
    async getRow(sheetName, startRow, startColumn) {
        const sheet = await this.getSheet(sheetName);
        let row = [];
        let counter = 0;
        for (let i = startColumn; i < 200; i++) {
            try {
                let cell = sheet.getCell(startRow, i);
                counter++;
                if (cell.value === '' || cell.value == null) {
                    break;
                }
                row.push(cell.value);
            } catch { break; }
        }
        return row;
    }


    /**
     * 
     * @param {*} sheetName 
     * @param {*} startRow 
     * @param {*} startColumn 
     * @returns {Promise<Array<(string|Number|Boolean)>>}
     */
    async getColumn(sheetName, startRow, startColumn) {
        const sheet = await this.getSheet(sheetName);
        let column = [];
        let counter = 0;
        for (let i = startRow; i < 200; i++) {
            try {
                let cell = sheet.getCell(i, startColumn);
                counter++;
                if (cell.value === '' || cell.value == null) {
                    break;
                }
                column.push(cell.value);
            } catch { break; }
        }
        return column;

    }


    async getCell(sheetName, row, column) {
        const sheet = await this.getSheet(sheetName);
        return sheet.getCell(row, column);
    }


}


/**
 * Wraps a callback function in an asynchronous Express middleware to handle Google Sheets operations.
 *
 * @param {function(worksheetId: string, sheetId: string): Promise<any>} cb - A callback function that requires two string parameters,
 *        `worksheetId` and `sheetId`, which represent the IDs necessary for sheet operations. This callback
 *        performs asynchronous tasks and should return a promise resolving to the data to be sent in the response.
 * @returns {Function} An asynchronous function that acts as middleware. It extracts `worksheetId` and `sheetId` 
 *         from `req.params`, invokes the callback `cb`, and handles the HTTP response based on the promise's 
 *         resolution or rejection.
 */
function sheetsHandle(cb) {

    return sheetsHandleAsync(async (req, res) => {
        let worksheetId = req.params.worksheetId;
        let sheetId = req.params.sheetId;

        let result = await cb(worksheetId, sheetId);
        try {
            res.status(200).json(result);
        } catch (e) {
            res.status(500).json({ error: e });
        }
    })
}
const sheetsHandleAsync = fn =>
    function asyncUtilWrap(...args) {
        const fnReturn = fn(...args)
        const next = args[args.length - 1]
        return Promise.resolve(fnReturn).catch(next)
    }


module.exports = { SheetsCache, sheetsHandle }

module.exports = {}



