import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function createExtension() {
  console.log('\nTitanium Proxy Extension Creator\n');
  
  const name = await question('Extension name: ');
  const version = await question('Version (1.0.0): ') || '1.0.0';
  const description = await question('Description: ');
  const author = await question('Author: ');
  
  const extName = name.toLowerCase().replace(/\s+/g, '-') + '.ext';
  const extPath = join('./extensions', extName);
  
  if (existsSync(extPath)) {
    console.error(`\nError: Extension ${extName} already exists!`);
    rl.close();
    return;
  }
  
  // Create extension directory
  await mkdir(extPath, { recursive: true });
  
  // Create manifest.json
  const manifest = {
    name: name,
    version: version,
    description: description,
    author: author,
    entry: 'index.js',
    permissions: ['proxy', 'storage', 'auth'],
    config: {
      enabled: true
    }
  };
  
  await writeFile(
    join(extPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  // Create index.js template
  const indexTemplate = `export default {
  // Called when extension loads
  async initialize(api) {
    this.api = api;
    this.storage = await api.getStorage('${name.toLowerCase().replace(/\s+/g, '-')}');
    
    api.logger.info('${name} extension initialized!');
    
    // Register event listeners
    api.on('user:login', this.onUserLogin.bind(this));
  },
  
  // Custom routes
  async routes(req, res, parsedUrl, auth) {
    if (parsedUrl.pathname === '/api/${name.toLowerCase().replace(/\s+/g, '-')}') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Hello from ${name}!',
        version: '${version}'
      }));
      return true;
    }
    return false;
  },
  
  // Hook: runs before every request
  async beforeRequest(req, res, parsedUrl) {
    // Add custom logic here
    return false; // false = continue, true = handled
  },
  
  // Event handlers
  async onUserLogin(data) {
    this.api.logger.info(\`User logged in: \${data.username}\`);
    
    // Track login count
    const count = (await this.storage.get('loginCount')) || 0;
    await this.storage.set('loginCount', count + 1);
  }
};
`;
  
  await writeFile(join(extPath, 'index.js'), indexTemplate);
  
  // Create README.md
  const readme = `# ${name}

${description}

## Installation

This extension is already installed in the \`extensions/\` directory.

## Configuration

Edit \`manifest.json\` to configure the extension:

\`\`\`json
{
  "enabled": true
}
\`\`\`

## Usage

This extension provides:
- Custom API endpoint: \`/api/${name.toLowerCase().replace(/\s+/g, '-')}\`
- Login event tracking

## Development

1. Edit \`index.js\` to add functionality
2. Restart the server to reload the extension
3. Check logs for extension activity

## Author

${author}

## Version

${version}
`;
  
  await writeFile(join(extPath, 'README.md'), readme);
  
  console.log(`\nSuccess! Extension created: ${extName}`);
  console.log(`Location: ${extPath}`);
  console.log('\nFiles created:');
  console.log('   - manifest.json');
  console.log('   - index.js');
  console.log('   - README.md');
  console.log('\nRestart the server to load the extension!\n');
  
  rl.close();
}

process.on('SIGINT', () => {
  console.log('\n\nExtension creation cancelled');
  rl.close();
  process.exit(0);
});

createExtension().catch(error => {
  console.error('Error creating extension:', error);
  rl.close();
  process.exit(1);
});