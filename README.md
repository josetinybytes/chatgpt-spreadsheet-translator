# chatgpt-spreadsheet-translator

`chatgpt-spreadsheet-translator` is a command-line tool that translates a Google spreadsheet into a format compatible with ChatGPT.

## Features

- Translate a specified Google spreadsheet.
- Optionally include a game context document and features sheet to provide better context for the translation.
- Configurable GPT version, with a fallback to GPT-4.0.

## Installation

Clone the repository and navigate to the project directory.

```bash
git clone <repository-url>
cd <project-directory>
```

Install the required dependencies.

```bash
npm install
```

### Extracting Document ID and Sheet ID

To manually obtain the document id and gid from a Google Sheets URL, look for the following parts of the URL:

document id: The part after /d/ and before the next /
gid: The value of the gid parameter in the query string
For example, in the URL https://docs.google.com/spreadsheets/d/1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro/edit?gid=583341809:

**document id:** 1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro
**sheet id:** 583341809

## Usage

To use the chatgpt-spreadsheet-translator program, you can specify various options and environment variables.

Command-Line Options

```bash
-s, --sheet <sheetToTranslate>: The URL of the Google spreadsheet to translate.
--game-context-document <gameContextDocument>: The Document ID of the game context and features document.
--feature-sheet <featureSheet>: The ID of the features sheet.
--game-context-sheet <gameContextSheet>: The ID of the game context sheet.
--ignore-game-context: Ignores the game context.
--gpt-version <gptVersion>: The GPT version to use (default: gpt-4o).
```

#### Environment Variables

The following environment variables are required for the program to function correctly:

Game Context and Features Sheets are optional, but if provided, will be used to provide better context for the translation.

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=<your-google-service-account-email> # The email associated with your Google service account.
GOOGLE_PRIVATE_KEY=<your-google-private-key> # The private key for your Google service account.
OPENAI_API_KEY=<your-openai-api-key> # The API key for accessing OpenAI's services.
OPENAI_API_ORG=<your-openai-api-organization> # The organization ID for OpenAI.
PARALLEL_TASKS=5 # The number of chat gpt request to run in parallel.
GAME_CONTEXT_DOCUMENT_ID_FALLBACK=<fallback-game-context-document-id> # Fallback document ID for the game context document if not provided.
GAME_CONTEXT_SHEET_ID_FALLBACK=<fallback-game-context-sheet-id> # Fallback sheet ID for the game context sheet if not provided.
FEATURE_SHEET_ID_FALLBACK=<fallback-feature-sheet-id> # Fallback sheet ID for the feature sheet if not provided.
```

#### Example Usage

```bash
node index.js -s https://docs.google.com/spreadsheets/d/1V-NGWWb3PxIl3YZmB7IqDWL6lgqtpG1S1tykvCp35ro/edit?gid=0#gid=0 --gpt-version gpt-3.5-turbo
```
