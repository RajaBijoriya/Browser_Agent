const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class BrowserAgent {
    constructor(apiKey = null, headless = false) {
        this.apiKey = apiKey || process.env.GEMINI_API_KEY;
        if (!this.apiKey) {
            throw new Error('Gemini API key is required. Set GEMINI_API_KEY environment variable or pass it directly.');
        }
        
        // Initialize Gemini AI
        this.genai = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        this.browser = null;
        this.page = null;
        this.headless = headless;
    }

    async startBrowser() {
        try {
            this.browser = await puppeteer.launch({
                headless: this.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });
            
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });
            
            console.log('Browser started successfully');
            return true;
        } catch (error) {
            console.error('Failed to start browser:', error);
            return false;
        }
    }

    async navigateToUrl(url) {
        try {
            console.log(`Navigating to: ${url}`);
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // Wait for dynamic content to load
            console.log('Waiting for dynamic content to load...');
            await this.page.waitForTimeout(5000);
            
            // Try to wait for common authentication elements
            try {
                await this.page.waitForSelector('form, input[type="email"], input[type="password"], button[type="submit"], .login, .signin, .auth', { timeout: 10000 });
                console.log('Authentication elements detected');
            } catch (e) {
                console.log('No immediate auth elements found, proceeding with analysis');
            }
            
            console.log('Navigation completed');
            return true;
        } catch (error) {
            console.error('Navigation failed:', error);
            return false;
        }
    }

    async takeScreenshot() {
        try {
            const screenshot = await this.page.screenshot({ 
                encoding: 'base64',
                fullPage: false 
            });
            return screenshot;
        } catch (error) {
            console.error('Failed to take screenshot:', error);
            return null;
        }
    }

    async getPageContent() {
        try {
            const content = await this.page.content();
            return content;
        } catch (error) {
            console.error('Failed to get page content:', error);
            return null;
        }
    }

    async analyzePageWithAI(instruction) {
        try {
            const screenshot = await this.takeScreenshot();
            const htmlContent = await this.getPageContent();
            
            if (!screenshot) {
                throw new Error('Failed to capture screenshot');
            }

            const prompt = `
You are an AI assistant helping with browser automation. Analyze this webpage screenshot to find authentication/login elements.

Task: ${instruction}

Look carefully at the screenshot for:
1. Login/signin buttons or links
2. Email/username input fields
3. Password input fields
4. Submit/login buttons
5. Any authentication forms or modals
6. Navigation elements that might lead to authentication

Even if there's no visible login form, look for:
- "Sign In", "Login", "Sign Up" buttons or links
- User account icons or profile buttons
- Navigation menus that might contain auth options

Respond in JSON format:
{
    "formFound": boolean,
    "authElementsVisible": boolean,
    "elementsToClick": [
        {
            "type": "button|link|input",
            "description": "what_this_element_is",
            "action": "click|fill",
            "value": "text_to_fill_or_null_for_click"
        }
    ],
    "formElements": [
        {
            "type": "input|button",
            "fieldType": "email|password|submit",
            "description": "field_description"
        }
    ],
    "nextSteps": "what_to_do_next",
    "pageAnalysis": "description_of_what_you_see"
}

HTML Content (first 3000 chars):
${htmlContent.substring(0, 3000)}
`;

            const result = await this.model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: screenshot,
                        mimeType: 'image/png'
                    }
                }
            ]);

            const response = await result.response;
            const text = response.text();
            
            console.log('AI Response:', text);
            
            // Try to extract JSON from the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log('Parsed AI Analysis:', JSON.stringify(parsed, null, 2));
                return parsed;
            } else {
                console.log('No JSON found, creating fallback response');
                return {
                    formFound: false,
                    authElementsVisible: false,
                    elementsToClick: [],
                    formElements: [],
                    nextSteps: 'Look for authentication elements manually',
                    pageAnalysis: 'AI could not parse the page structure'
                };
            }
        } catch (error) {
            console.error('AI analysis failed:', error);
            return null;
        }
    }

    async fillForm(formData) {
        try {
            console.log('Filling form with AI-detected elements...');
            
            for (const element of formData.formElements) {
                if (element.type === 'input' && element.suggestedValue) {
                    try {
                        await this.page.waitForSelector(element.selector, { timeout: 5000 });
                        await this.page.click(element.selector);
                        await this.page.keyboard.selectAll();
                        await this.page.type(element.selector, element.suggestedValue);
                        console.log(`Filled ${element.label} with: ${element.suggestedValue}`);
                        await this.page.waitForTimeout(500);
                    } catch (error) {
                        console.error(`Failed to fill ${element.label}:`, error);
                    }
                }
            }
            
            return true;
        } catch (error) {
            console.error('Form filling failed:', error);
            return false;
        }
    }

    async clickSubmitButton(submitButton) {
        try {
            console.log(`Clicking submit button: ${submitButton.text}`);
            await this.page.waitForSelector(submitButton.selector, { timeout: 5000 });
            await this.page.click(submitButton.selector);
            await this.page.waitForTimeout(3000); // Wait for form submission
            console.log('Submit button clicked successfully');
            return true;
        } catch (error) {
            console.error('Failed to click submit button:', error);
            return false;
        }
    }

    async performAuthentication(url, credentials = null) {
        try {
            // Start browser if not already started
            if (!this.browser) {
                await this.startBrowser();
            }

            // Navigate to the URL
            const navigationSuccess = await this.navigateToUrl(url);
            if (!navigationSuccess) {
                throw new Error('Failed to navigate to URL');
            }

            // Analyze page with AI
            const instruction = `Go to ${url}, locate the authentication form automatically, fill in the necessary details, and click the action/submit button`;
            const analysis = await this.analyzePageWithAI(instruction);
            
            if (!analysis) {
                throw new Error('Failed to analyze page with AI');
            }

            console.log('AI Analysis Result:', JSON.stringify(analysis, null, 2));

            // Use provided credentials or default test values
            const testCredentials = credentials || {
                email: process.env.TEST_EMAIL || 'test@example.com',
                password: process.env.TEST_PASSWORD || 'testpassword123'
            };

            // Try different strategies based on analysis
            if (analysis.formFound) {
                console.log('Direct form found, attempting to fill...');
                return await this.handleDirectForm(analysis, testCredentials);
            } else if (analysis.authElementsVisible) {
                console.log('Auth elements visible, attempting interaction...');
                return await this.handleAuthElements(analysis, testCredentials);
            } else {
                console.log('No obvious auth elements, trying fallback detection...');
                return await this.tryFallbackDetection(testCredentials);
            }

        } catch (error) {
            console.error('Authentication failed:', error);
            return false;
        }
    }

    async handleDirectForm(analysis, credentials) {
        // Update form elements with actual credentials
        analysis.formElements.forEach(element => {
            if (element.label && (element.label.toLowerCase().includes('email') || element.label.toLowerCase().includes('username'))) {
                element.suggestedValue = credentials.email;
            } else if (element.label && element.label.toLowerCase().includes('password')) {
                element.suggestedValue = credentials.password;
            }
        });

        // Fill the form
        const fillSuccess = await this.fillForm(analysis);
        if (!fillSuccess) {
            return false;
        }

        // Click submit button
        if (analysis.submitButton) {
            return await this.clickSubmitButton(analysis.submitButton);
        }
        return true;
    }

    async handleAuthElements(analysis, credentials) {
        for (const element of analysis.elementsToClick) {
            if (element.action === 'click') {
                console.log(`Clicking ${element.description}...`);
                // Try common selectors for auth buttons
                const selectors = [
                    'button:contains("Sign In")', 'button:contains("Login")', 'button:contains("Sign Up")',
                    'a:contains("Sign In")', 'a:contains("Login")', 'a:contains("Sign Up")',
                    '[data-testid*="login"]', '[data-testid*="signin"]', '[data-testid*="auth"]',
                    '.login-btn', '.signin-btn', '.auth-btn'
                ];
                
                for (const selector of selectors) {
                    try {
                        const elements = await this.page.$$(selector);
                        if (elements.length > 0) {
                            await elements[0].click();
                            await this.page.waitForTimeout(2000);
                            console.log(`Clicked element with selector: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        // Continue to next selector
                    }
                }
            }
        }
        return true;
    }

    async tryFallbackDetection(credentials) {
        console.log('Trying fallback detection methods...');
        
        // Look for common authentication patterns
        const authSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:contains("Sign")',
            'button:contains("Login")',
            'a[href*="login"]',
            'a[href*="signin"]',
            'a[href*="auth"]',
            '.btn-primary',
            '.login',
            '.signin',
            '.auth'
        ];

        for (const selector of authSelectors) {
            try {
                const element = await this.page.$(selector);
                if (element) {
                    console.log(`Found potential auth element: ${selector}`);
                    await element.click();
                    await this.page.waitForTimeout(3000);
                    
                    // After clicking, try to find and fill form
                    const formFound = await this.tryFillAnyForm(credentials);
                    if (formFound) {
                        return true;
                    }
                }
            } catch (e) {
                // Continue to next selector
            }
        }
        
        console.log('No authentication elements found with fallback methods');
        return false;
    }

    async tryFillAnyForm(credentials) {
        try {
            // Look for email/username fields
            const emailSelectors = ['input[type="email"]', 'input[name*="email"]', 'input[name*="username"]', 'input[placeholder*="email"]'];
            const passwordSelectors = ['input[type="password"]', 'input[name*="password"]'];
            
            let emailFilled = false;
            let passwordFilled = false;
            
            // Fill email field
            for (const selector of emailSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        await element.click();
                        await element.type(credentials.email);
                        emailFilled = true;
                        console.log(`Filled email with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }
            
            // Fill password field
            for (const selector of passwordSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        await element.click();
                        await element.type(credentials.password);
                        passwordFilled = true;
                        console.log(`Filled password with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }
            
            if (emailFilled && passwordFilled) {
                // Try to submit
                const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:contains("Sign")', 'button:contains("Login")'];
                for (const selector of submitSelectors) {
                    try {
                        const element = await this.page.$(selector);
                        if (element) {
                            await element.click();
                            console.log(`Clicked submit with selector: ${selector}`);
                            await this.page.waitForTimeout(3000);
                            return true;
                        }
                    } catch (e) {
                        // Continue
                    }
                }
            }
            
            return emailFilled || passwordFilled;
        } catch (error) {
            console.error('Error in tryFillAnyForm:', error);
            return false;
        }
    }

    async closeBrowser() {
        try {
            if (this.browser) {
                await this.browser.close();
                console.log('Browser closed successfully');
            }
        } catch (error) {
            console.error('Failed to close browser:', error);
        }
    }

    async waitForNavigation(timeout = 10000) {
        try {
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout });
            return true;
        } catch (error) {
            console.error('Navigation timeout:', error);
            return false;
        }
    }
}

module.exports = BrowserAgent;
