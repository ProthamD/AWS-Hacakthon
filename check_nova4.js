const fs = require('fs');
const { BedrockClient, ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');
const client = new BedrockClient({ region: 'us-east-1' }); 
async function run() {
  try {
    const res = await client.send(new ListFoundationModelsCommand({}));
    const nova = res.modelSummaries.filter(m => m.modelId.toLowerCase().includes('nova'));
    const sonic = res.modelSummaries.filter(m => m.modelId.toLowerCase().includes('sonic'));
    let out = 'NOVA MODELS:\n' + nova.map(m => m.modelId).join('\n');
    out += '\n\nSONIC MODELS:\n' + sonic.map(m => m.modelId).join('\n');
    fs.writeFileSync('models.txt', out);
  } catch(e) { 
    fs.writeFileSync('models.txt', 'Error: ' + e.message); 
  }
}
run();
