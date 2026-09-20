const { BedrockClient, ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');
const client = new BedrockClient({ region: 'us-east-1' }); // Nova is usually in us-east-1
async function run() {
  try {
    const res = await client.send(new ListFoundationModelsCommand({}));
    const nova = res.modelSummaries.filter(m => m.modelId.toLowerCase().includes('nova'));
    if (nova.length) {
      console.log('NOVA MODELS:');
      nova.forEach(m => console.log(m.modelId));
    } else {
      console.log('No Nova models found.');
    }
  } catch(e) { console.error('Error:', e.message); }
}
run();
