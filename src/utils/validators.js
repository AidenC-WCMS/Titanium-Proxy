/**
 * Validate username
 */
export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }
  
  if (username.length < 3 || username.length > 50) {
    return { valid: false, error: 'Username must be 3-50 characters' };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }
  
  return { valid: true };
}

/**
 * Validate password
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  
  if (password.length > 100) {
    return { valid: false, error: 'Password must be less than 100 characters' };
  }
  
  // Check for at least one letter and one number (optional - uncomment if needed)
  // if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
  //   return { valid: false, error: 'Password must contain at least one letter and one number' };
  // }
  
  return { valid: true };
}

/**
 * Validate URL
 */
export function validateURL(urlString) {
  try {
    const url = new URL(urlString);
    
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }
    
    return { valid: true, url };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate email
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
}

/**
 * Sanitize filename (remove dangerous characters)
 */
export function sanitizeFilename(filename) {
  // Remove dangerous characters
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .substring(0, 255);
}

/**
 * Sanitize path (prevent directory traversal)
 */
export function sanitizePath(filePath) {
  // Remove path traversal attempts
  return filePath
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '');
}

/**
 * Validate extension name (.ext format)
 */
export function isValidExtensionName(name) {
  return /^[a-z0-9-]+\.ext$/.test(name);
}

/**
 * Validate IP address
 */
export function validateIP(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
  
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    return { valid: false, error: 'Invalid IP address format' };
  }
  
  // Validate IPv4 octets
  if (ipv4Regex.test(ip)) {
    const octets = ip.split('.');
    for (const octet of octets) {
      const num = parseInt(octet);
      if (num < 0 || num > 255) {
        return { valid: false, error: 'Invalid IPv4 address' };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Validate port number
 */
export function validatePort(port) {
  const num = parseInt(port);
  
  if (isNaN(num) || num < 1 || num > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' };
  }
  
  return { valid: true };
}

/**
 * Sanitize HTML (basic)
 */
export function sanitizeHTML(html) {
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate JSON string
 */
export function validateJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    return { valid: true, data: parsed };
  } catch (error) {
    return { valid: false, error: 'Invalid JSON format' };
  }
}

/**
 * Validate object has required keys
 */
export function validateRequiredKeys(obj, requiredKeys) {
  const missing = requiredKeys.filter(key => !(key in obj));
  
  if (missing.length > 0) {
    return { 
      valid: false, 
      error: `Missing required keys: ${missing.join(', ')}` 
    };
  }
  
  return { valid: true };
}