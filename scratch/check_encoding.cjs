const fs = require('fs');
const buffer = fs.readFileSync('pages/CashFlow.tsx');
// Let's look at lines around 125-132
const content = buffer.toString('binary');
const lines = content.split('\n');
for (let i = 120; i < 140; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
}
