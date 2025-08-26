const BrowserAgent = require('./browser-agent');

async function testAgent() {
    console.log('🧪 Testing Browser Agent with custom credentials...');
    
    const agent = new BrowserAgent(null, false); // Set headless to false to see the browser
    
    try {
        // Test with custom credentials
        const testCredentials = {
            email: 'test@example.com',
            password: 'testpassword123'
        };
        
        console.log('🎯 Target: ui.chaicode.com');
        console.log('📝 Using test credentials:', testCredentials.email);
        
        const success = await agent.performAuthentication(
            'https://ui.chaicode.com', 
            testCredentials
        );
        
        if (success) {
            console.log('✅ Test completed successfully!');
        } else {
            console.log('❌ Test failed');
        }
        
    } catch (error) {
        console.error('💥 Test error:', error);
    } finally {
        await agent.closeBrowser();
    }
}

if (require.main === module) {
    testAgent().catch(console.error);
}
