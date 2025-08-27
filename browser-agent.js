const puppeteer = require("puppeteer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

class BrowserAgent {
  constructor(apiKey = null, headless = false) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        "Gemini API key is required. Set GEMINI_API_KEY environment variable or pass it directly."
      );
    }

    // Initialize Gemini AI
    this.genai = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genai.getGenerativeModel({ model: "gemini-1.5-flash" });

    this.browser = null;
    this.page = null;
    this.headless = headless;
  }

  async startBrowser() {
    try {
      this.browser = await puppeteer.launch({
        headless: this.headless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1920, height: 1080 });

      console.log("Browser started successfully");
      return true;
    } catch (error) {
      console.error("Failed to start browser:", error);
      return false;
    }
  }

  async navigateToUrl(url) {
    try {
      console.log(`Navigating to: ${url}`);
      await this.page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      // Wait for dynamic content to load
      console.log("Waiting for dynamic content to load...");
      await this.page.waitForTimeout(5000);

      // Try to wait for common authentication elements
      try {
        await this.page.waitForSelector(
          'form, input[type="email"], input[type="password"], button[type="submit"], .login, .signin, .auth',
          { timeout: 10000 }
        );
        console.log("Authentication elements detected");
      } catch (e) {
        console.log(
          "No immediate auth elements found, proceeding with analysis"
        );
      }

      console.log("Navigation completed");
      return true;
    } catch (error) {
      console.error("Navigation failed:", error);
      return false;
    }
  }

  async takeScreenshot() {
    try {
      const screenshot = await this.page.screenshot({
        encoding: "base64",
        fullPage: false,
      });
      return screenshot;
    } catch (error) {
      console.error("Failed to take screenshot:", error);
      return null;
    }
  }

  async getPageContent() {
    try {
      const content = await this.page.content();
      return content;
    } catch (error) {
      console.error("Failed to get page content:", error);
      return null;
    }
  }

  async analyzePageWithAI(instruction) {
    try {
      const screenshot = await this.takeScreenshot();
      const htmlContent = await this.getPageContent();

      if (!screenshot) {
        throw new Error("Failed to capture screenshot");
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
            mimeType: "image/png",
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();

      console.log("AI Response:", text);

      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("Parsed AI Analysis:", JSON.stringify(parsed, null, 2));
        return parsed;
      } else {
        console.log("No JSON found, creating fallback response");
        return {
          formFound: false,
          authElementsVisible: false,
          elementsToClick: [],
          formElements: [],
          nextSteps: "Look for authentication elements manually",
          pageAnalysis: "AI could not parse the page structure",
        };
      }
    } catch (error) {
      console.error("AI analysis failed:", error);
      return null;
    }
  }

  async fillForm(formData) {
    try {
      console.log("Filling form with AI-detected elements...");

      for (const element of formData.formElements) {
        if (element.type === "input" && element.suggestedValue) {
          try {
            await this.page.waitForSelector(element.selector, {
              timeout: 5000,
            });
            await this.page.click(element.selector);
            await this.page.keyboard.selectAll();
            await this.page.type(element.selector, element.suggestedValue);
            console.log(
              `Filled ${element.label} with: ${element.suggestedValue}`
            );
            await this.page.waitForTimeout(500);
          } catch (error) {
            console.error(`Failed to fill ${element.label}:`, error);
          }
        }
      }

      return true;
    } catch (error) {
      console.error("Form filling failed:", error);
      return false;
    }
  }

  async clickSubmitButton(submitButton) {
    try {
      console.log(`Clicking submit button: ${submitButton.text}`);
      await this.page.waitForSelector(submitButton.selector, { timeout: 5000 });
      await this.page.click(submitButton.selector);
      await this.page.waitForTimeout(3000); // Wait for form submission
      console.log("Submit button clicked successfully");
      return true;
    } catch (error) {
      console.error("Failed to click submit button:", error);
      return false;
    }
  }

  async performAuthentication(url, credentials = null, extraData = {}) {
    try {
      // Start browser if not already started
      if (!this.browser) {
        await this.startBrowser();
      }

      // Navigate to the URL
      const navigationSuccess = await this.navigateToUrl(url);
      if (!navigationSuccess) {
        throw new Error("Failed to navigate to URL");
      }

      // Heuristic pass: try to fill common fields and submit first
      const initialHeuristic = await this.fillCommonFieldsAndSubmit(
        credentials || {
          email: process.env.TEST_EMAIL || "test@example.com",
          password: process.env.TEST_PASSWORD || "testpassword123",
        },
        extraData
      );

      if (initialHeuristic) {
        return true;
      }

      // Analyze page with AI (secondary strategy)
      const instruction = `Go to ${url}, locate the authentication form automatically, fill in the necessary details, and click the action/submit button`;
      const analysis = await this.analyzePageWithAI(instruction);

      if (!analysis) {
        throw new Error("Failed to analyze page with AI");
      }

      console.log("AI Analysis Result:", JSON.stringify(analysis, null, 2));

      // Use provided credentials or default test values
      const testCredentials = credentials || {
        email: process.env.TEST_EMAIL || "test@example.com",
        password: process.env.TEST_PASSWORD || "testpassword123",
      };

      // Try different strategies based on analysis
      if (analysis.formFound) {
        console.log("Direct form found, attempting to fill...");
        return await this.handleDirectForm(analysis, testCredentials);
      } else if (analysis.authElementsVisible) {
        console.log("Auth elements visible, attempting interaction...");
        return await this.handleAuthElements(analysis, testCredentials);
      } else {
        console.log("No obvious auth elements, trying fallback detection...");
        const fallback = await this.tryFallbackDetection(testCredentials);
        if (fallback) return true;
        return await this.fillCommonFieldsAndSubmit(testCredentials, extraData);
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      return false;
    }
  }

  async fillCommonFieldsAndSubmit(credentials, extraData = {}) {
    try {
      const defaultData = {
        firstName: process.env.FIRST_NAME || "John",
        lastName: process.env.LAST_NAME || "Doe",
        fullName: process.env.FULL_NAME || "John Doe",
        phone: process.env.PHONE || "5551234567",
        username: process.env.USERNAME || credentials.email.split("@")[0],
        email: credentials.email,
        password: credentials.password,
        confirmPassword: credentials.password,
        company: process.env.COMPANY || "Acme Inc",
        address: process.env.ADDRESS || "123 Main St",
        city: process.env.CITY || "Metropolis",
        zip: process.env.ZIP || "12345",
      };
      const merged = { ...defaultData, ...extraData };
      const slowMode = !!merged.__slow;
      const typeDelay =
        typeof merged.__typeDelay === "number" &&
        !Number.isNaN(merged.__typeDelay)
          ? merged.__typeDelay
          : 100;

      // Collect and fill inputs heuristically in-page
      await this.page.evaluate(async (data) => {
        const matches = (text, ...needles) => {
          if (!text) return false;
          const t = text.toLowerCase();
          return needles.some((n) => t.includes(n));
        };

        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        const setInputValue = async (el, value) => {
          if (!el || value == null) return;
          const tag = el.tagName.toLowerCase();
          if (tag === "input" || tag === "textarea") {
            el.focus();
            // Clear existing
            if (el.value && el.value.length) {
              el.value = "";
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }
            const str = String(value);
            if (data.__slow) {
              for (let i = 0; i < str.length; i++) {
                el.value += str[i];
                el.dispatchEvent(new Event("input", { bubbles: true }));
                await delay(
                  typeof data.__typeDelay === "number" ? data.__typeDelay : 120
                );
              }
            } else {
              el.value = str;
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        };

        const getLabelText = (el) => {
          // by for attribute
          const id = el.getAttribute("id");
          if (id) {
            const lab = document.querySelector(
              `label[for="${CSS.escape(id)}"]`
            );
            if (lab) return lab.textContent || "";
          }
          // wrapping label
          const lab = el.closest("label");
          return lab ? lab.textContent || "" : "";
        };

        const inputs = Array.from(
          document.querySelectorAll("input, textarea")
        ).filter((el) => !el.disabled && el.offsetParent !== null);

        for (const el of inputs) {
          const type = (el.getAttribute("type") || "text").toLowerCase();
          const name = el.getAttribute("name") || "";
          const placeholder = el.getAttribute("placeholder") || "";
          const aria = el.getAttribute("aria-label") || "";
          const label = getLabelText(el);
          const hint = `${name} ${placeholder} ${aria} ${label}`.toLowerCase();

          if (type === "hidden" || type === "file") continue;

          // Decide value
          let value = null;
          // Direct key match override (from --field/data): prefer exact name/placeholder/label
          if (name && Object.prototype.hasOwnProperty.call(data, name)) {
            value = data[name];
          } else if (
            placeholder &&
            Object.prototype.hasOwnProperty.call(data, placeholder)
          ) {
            value = data[placeholder];
          } else if (
            label &&
            Object.prototype.hasOwnProperty.call(data, label)
          ) {
            value = data[label];
          }
          if (type === "email" || matches(hint, "email", "e-mail")) {
            value = value != null ? value : data.email;
          } else if (
            type === "password" ||
            matches(hint, "password", "passcode")
          ) {
            if (value == null) {
              if (matches(hint, "confirm", "retype", "repeat"))
                value = data.confirmPassword;
              else value = data.password;
            }
          } else if (matches(hint, "first name", "firstname", "given")) {
            value = value != null ? value : data.firstName;
          } else if (
            matches(hint, "last name", "lastname", "surname", "family")
          ) {
            value = value != null ? value : data.lastName;
          } else if (matches(hint, "full name", "name")) {
            value = value != null ? value : data.fullName;
          } else if (
            type === "tel" ||
            matches(hint, "phone", "mobile", "telephone")
          ) {
            value = value != null ? value : data.phone;
          } else if (matches(hint, "username", "user name", "login id")) {
            value = value != null ? value : data.username;
          } else if (matches(hint, "company", "organization")) {
            value = value != null ? value : data.company;
          } else if (matches(hint, "address", "street")) {
            value = value != null ? value : data.address;
          } else if (matches(hint, "city", "town")) {
            value = value != null ? value : data.city;
          } else if (matches(hint, "zip", "postal", "postcode")) {
            value = value != null ? value : data.zip;
          } else if (type === "text" || type === "search") {
            // Generic text: put something reasonable
            value =
              value != null
                ? value
                : placeholder || label
                ? "Sample"
                : "Sample";
          }

          if (value != null) {
            await setInputValue(el, String(value));
            if (data.__slow) {
              await delay(
                typeof data.__typeDelay === "number" ? data.__typeDelay : 120
              );
            }
          }
        }
      }, merged);

      // Try to submit
      const submitClicked = await (async () => {
        // 1) type=submit
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
        ];
        for (const sel of submitSelectors) {
          const el = await this.page.$(sel);
          if (el) {
            await el.click();
            await this.page.waitForTimeout(2000);
            return true;
          }
        }
        // 2) Buttons/links with text
        const texts = [
          "Sign In",
          "Log in",
          "Login",
          "Register",
          "Sign Up",
          "Create Account",
          "Submit",
          "Continue",
          "Next",
        ];
        for (const text of texts) {
          const [el] = await this.page.$x(
            `//button[contains(normalize-space(.), ${JSON.stringify(
              text
            )})] | //a[contains(normalize-space(.), ${JSON.stringify(
              text
            )})] | //input[@type='submit' and contains(@value, ${JSON.stringify(
              text
            )})]`
          );
          if (el) {
            await el.click();
            await this.page.waitForTimeout(2000);
            return true;
          }
        }
        return false;
      })();

      return submitClicked || true; // Even if not submitted, fields got filled
    } catch (e) {
      return false;
    }
  }

  async handleDirectForm(analysis, credentials) {
    // Update form elements with actual credentials
    analysis.formElements.forEach((element) => {
      if (
        element.label &&
        (element.label.toLowerCase().includes("email") ||
          element.label.toLowerCase().includes("username"))
      ) {
        element.suggestedValue = credentials.email;
      } else if (
        element.label &&
        element.label.toLowerCase().includes("password")
      ) {
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
    // Helper to click first matching element by visible text using XPath
    const clickByVisibleText = async (texts) => {
      for (const text of texts) {
        try {
          const xpath = `//*[self::button or self::a][contains(normalize-space(.), ${JSON.stringify(
            text
          )})]`;
          const [el] = await this.page.$x(xpath);
          if (el) {
            await el.click();
            await this.page.waitForTimeout(2000);
            console.log(`Clicked element by text: ${text}`);
            return true;
          }
        } catch (_) {
          // try next text
        }
      }
      return false;
    };

    for (const element of analysis.elementsToClick) {
      if (element.action === "click") {
        console.log(`Clicking ${element.description}...`);

        // Try attribute/class based selectors first
        const attrSelectors = [
          '[data-testid*="login"]',
          '[data-testid*="signin"]',
          '[data-testid*="auth"]',
          ".login-btn",
          ".signin-btn",
          ".auth-btn",
        ];
        let clicked = false;
        for (const selector of attrSelectors) {
          try {
            const elements = await this.page.$$(selector);
            if (elements && elements.length > 0) {
              await elements[0].click();
              await this.page.waitForTimeout(2000);
              console.log(`Clicked element with selector: ${selector}`);
              clicked = true;
              break;
            }
          } catch (_) {}
        }

        if (!clicked) {
          // Fallback to text search
          await clickByVisibleText([
            "Sign In",
            "Login",
            "Sign Up",
            "Log in",
            "Sign in",
          ]);
        }
      }
    }
    return true;
  }

  async tryFallbackDetection(credentials) {
    console.log("Trying fallback detection methods...");

    // Look for common authentication patterns
    const authSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'a[href*="login"]',
      'a[href*="signin"]',
      'a[href*="auth"]',
      ".btn-primary",
      ".login",
      ".signin",
      ".auth",
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

    // If not found by selector, try clicking by common auth texts
    const texts = ["Sign In", "Login", "Sign Up", "Log in", "Sign in"];
    for (const text of texts) {
      try {
        const [el] = await this.page.$x(
          `//*[self::button or self::a][contains(normalize-space(.), ${JSON.stringify(
            text
          )})]`
        );
        if (el) {
          await el.click();
          await this.page.waitForTimeout(3000);
          const formFound = await this.tryFillAnyForm(credentials);
          if (formFound) {
            return true;
          }
        }
      } catch (_) {}
    }

    console.log("No authentication elements found with fallback methods");
    return false;
  }

  async tryFillAnyForm(credentials) {
    try {
      // Look for email/username fields
      const emailSelectors = [
        'input[type="email"]',
        'input[name*="email"]',
        'input[name*="username"]',
        'input[placeholder*="email"]',
      ];
      const passwordSelectors = [
        'input[type="password"]',
        'input[name*="password"]',
      ];

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
        // Try to submit by attribute selectors
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
        ];
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

        // Fallback: click submit by visible text
        const submitTexts = ["Sign In", "Login", "Submit", "Log in"];
        for (const text of submitTexts) {
          try {
            const [el] = await this.page.$x(
              `//button[contains(normalize-space(.), ${JSON.stringify(
                text
              )})] | //input[@type='submit' and contains(@value, ${JSON.stringify(
                text
              )})]`
            );
            if (el) {
              await el.click();
              console.log(`Clicked submit by text: ${text}`);
              await this.page.waitForTimeout(3000);
              return true;
            }
          } catch (_) {}
        }
      }

      return emailFilled || passwordFilled;
    } catch (error) {
      console.error("Error in tryFillAnyForm:", error);
      return false;
    }
  }

  async closeBrowser() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log("Browser closed successfully");
      }
    } catch (error) {
      console.error("Failed to close browser:", error);
    }
  }

  async waitForNavigation(timeout = 10000) {
    try {
      await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout });
      return true;
    } catch (error) {
      console.error("Navigation timeout:", error);
      return false;
    }
  }
}

module.exports = BrowserAgent;
