const BrowserAgent = require("./browser-agent");

async function main() {
  // Parse CLI args: node index.js --url <url> --email <email> --password <password> [--headless] [--slow] [--typeDelay 120] [--data '{"key":"value"}'] [--field key=value]
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")
      ? args[idx + 1]
      : null;
  };
  const urlArg =
    getArg("--url") ||
    process.env.TARGET_URL ||
    "https://ui.chaicode.com/auth/signup";
  const emailArg =
    getArg("--email") || process.env.TEST_EMAIL || "test@example.com";
  const passwordArg =
    getArg("--password") || process.env.TEST_PASSWORD || "testpassword123";
  const headless = args.includes("--headless");
  const slowMode = args.includes("--slow");
  const typeDelayArg = getArg("--typeDelay");
  const typeDelay = typeDelayArg ? parseInt(typeDelayArg, 10) : undefined;

  // Parse extra form data
  let extraData = {};
  const dataJson = getArg("--data");
  if (dataJson) {
    try {
      extraData = JSON.parse(dataJson);
    } catch (_) {}
  }
  // Repeated --field key=value
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--field" && args[i + 1] && !args[i + 1].startsWith("--")) {
      const kv = args[i + 1];
      const eq = kv.indexOf("=");
      if (eq > 0) {
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        if (k) extraData[k] = v;
      }
      i++;
    }
  }

  // Control flags for filling behavior
  extraData.__slow = slowMode;
  if (typeof typeDelay === "number" && !Number.isNaN(typeDelay)) {
    extraData.__typeDelay = typeDelay;
  }

  const agent = new BrowserAgent(null, headless);

  try {
    console.log("🤖 Starting Browser Agent...");
    console.log("📋 Task: Open URL and fill form using AI/heuristics");
    console.log(`🌐 URL: ${urlArg}`);
    console.log(`👤 Email: ${emailArg}`);

    // Perform the authentication task
    const success = await agent.performAuthentication(
      urlArg,
      {
        email: emailArg,
        password: passwordArg,
      },
      extraData
    );

    if (success) {
      console.log("✅ Authentication task completed successfully!");

      // Wait a bit to see the result
      console.log("⏳ Waiting 5 seconds to observe the result...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      console.log("❌ Authentication task failed");
    }
  } catch (error) {
    console.error("💥 Error during execution:", error);
  } finally {
    // Close the browser
    await agent.closeBrowser();
    console.log("🔚 Browser Agent session ended");
  }
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
