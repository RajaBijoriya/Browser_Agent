# Browser Agent - AI-Powered Web Automation

An intelligent browser automation agent that uses Puppeteer and Google's Gemini AI to interact with web pages like a human.

## Features

- 🤖 **AI-Powered Form Detection**: Uses Gemini 2.5 Flash to automatically identify and interact with web forms
- 🌐 **Smart Navigation**: Automatically navigates to websites and handles page loading
- 📝 **Intelligent Form Filling**: Detects form fields and fills them with appropriate values
- 🎯 **Automated Authentication**: Specifically designed to handle login/authentication forms
- 📸 **Visual Analysis**: Takes screenshots and analyzes page content for better decision making

## Prerequisites

- Node.js (v16 or higher)
- Google Gemini API key
- Chrome browser (automatically managed by Puppeteer)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   TEST_EMAIL=your_test_email@example.com
   TEST_PASSWORD=your_test_password
   ```

## Usage

### Basic Usage

Run the agent to automatically navigate to ui.chaicode.com and perform authentication:

```bash
npm start
```

### Test Mode

Run in test mode with custom credentials:

```bash
npm test
```

### Programmatic Usage

```javascript
const BrowserAgent = require('./browser-agent');

async function example() {
    const agent = new BrowserAgent();
    
    // Perform authentication on any website
    const success = await agent.performAuthentication('https://example.com', {
        email: 'user@example.com',
        password: 'password123'
    });
    
    if (success) {
        console.log('Authentication successful!');
    }
    
    await agent.closeBrowser();
}
```

## How It Works

1. **Page Navigation**: The agent navigates to the specified URL
2. **AI Analysis**: Takes a screenshot and analyzes the page content using Gemini AI
3. **Form Detection**: Identifies authentication forms and their elements
4. **Smart Filling**: Fills form fields with appropriate values
5. **Submission**: Clicks the submit button to complete the authentication

## API Reference

### BrowserAgent Class

#### Constructor
```javascript
new BrowserAgent(apiKey, headless)
```
- `apiKey`: Gemini API key (optional if set in environment)
- `headless`: Run browser in headless mode (default: false)

#### Methods

- `startBrowser()`: Initialize and start the browser
- `navigateToUrl(url)`: Navigate to a specific URL
- `performAuthentication(url, credentials)`: Complete authentication flow
- `closeBrowser()`: Close the browser session

## Configuration

### Environment Variables

- `GEMINI_API_KEY`: Your Google Gemini API key (required)
- `TEST_EMAIL`: Default email for testing (optional)
- `TEST_PASSWORD`: Default password for testing (optional)

## Error Handling

The agent includes comprehensive error handling for:
- Network timeouts
- Element not found scenarios
- AI analysis failures
- Form submission errors

## Security Notes

- Never hardcode credentials in your code
- Use environment variables for sensitive data
- The agent respects robots.txt and rate limiting
- Screenshots are processed locally and not stored permanently

## Troubleshooting

### Common Issues

1. **"Gemini API key is required"**
   - Ensure your `.env` file contains a valid `GEMINI_API_KEY`

2. **Browser fails to start**
   - Make sure you have sufficient system resources
   - Try running in headless mode

3. **Form not detected**
   - The page might be using dynamic content loading
   - Try increasing wait times or adding custom selectors

## License

MIT License
