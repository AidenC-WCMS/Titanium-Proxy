import bcrypt from 'bcrypt';
import { readFile, writeFile, mkdir } from 'fs/promises';
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

async function addUser() {
  console.log('\nTitanium Proxy User Creator\n');
  
  try {
    const username = await question('Username: ');
    
    if (!username || username.trim().length === 0) {
      console.error('\nError: Username cannot be empty!');
      rl.close();
      return;
    }
    
    if (username.length < 3) {
      console.error('\nError: Username must be at least 3 characters!');
      rl.close();
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      console.error('\nError: Username can only contain letters, numbers, underscores, and hyphens!');
      rl.close();
      return;
    }
    
    const password = await question('Password: ');
    const confirmPassword = await question('Confirm password: ');
    
    if (password !== confirmPassword) {
      console.error('\nError: Passwords do not match!');
      rl.close();
      return;
    }
    
    if (password.length < 8) {
      console.error('\nError: Password must be at least 8 characters!');
      rl.close();
      return;
    }
    
    const dataPath = './data';
    const usersFile = join(dataPath, 'users.json');
    
    // Ensure data directory exists
    if (!existsSync(dataPath)) {
      await mkdir(dataPath, { recursive: true });
      console.log('Created data directory');
    }
    
    // Load existing users
    let users = { users: [] };
    if (existsSync(usersFile)) {
      try {
        const data = await readFile(usersFile, 'utf8');
        users = JSON.parse(data);
      } catch (error) {
        console.error('\nError reading users file:', error.message);
        rl.close();
        return;
      }
    }
    
    // Check if user exists
    if (users.users.find(u => u.username === username)) {
      console.error('\nError: User already exists!');
      rl.close();
      return;
    }
    
    // Hash password
    console.log('\nHashing password...');
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Add user
    users.users.push({
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      role: users.users.length === 0 ? 'admin' : 'user'
    });
    
    // Save users
    await writeFile(usersFile, JSON.stringify(users, null, 2));
    
    console.log(`\nSuccess! User created:`);
    console.log(`  Username: ${username}`);
    console.log(`  Role: ${users.users[users.users.length - 1].role}`);
    console.log(`  Total users: ${users.users.length}\n`);
    
  } catch (error) {
    console.error('\nError creating user:', error.message);
  } finally {
    rl.close();
  }
}

process.on('SIGINT', () => {
  console.log('\n\nUser creation cancelled');
  rl.close();
  process.exit(0);
});

addUser().catch(error => {
  console.error('\nUnexpected error:', error);
  rl.close();
  process.exit(1);
});