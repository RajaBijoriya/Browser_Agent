const BrowserAgent = require('./browser-agent');

async function main() {
    const agent = new BrowserAgent();
    
    try {
        console.log('🤖 Starting Browser Agent...');
        console.log('📋 Task: Navigate to ui.chaicode.com and perform authentication');
        
        // Perform the authentication task
        const success = await agent.performAuthentication('https://ui.chaicode.com');
        
        if (success) {
            console.log('✅ Authentication task completed successfully!');
            
            // Wait a bit to see the result
            console.log('⏳ Waiting 5 seconds to observe the result...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
        } else {
            console.log('❌ Authentication task failed');
        }
        
    } catch (error) {
        console.error('💥 Error during execution:', error);
    } finally {
        // Close the browser
        await agent.closeBrowser();
        console.log('🔚 Browser Agent session ended');
    }
}

// Run the main function
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
