export function extractDeviceInfo(userAgent: string): string {
  if (!userAgent) return 'API Client';
  
  // Handle API testing tools
  if (userAgent.includes('Thunder Client')) {
    return 'Thunder Client (API Testing)';
  } else if (userAgent.includes('Postman')) {
    return 'Postman (API Testing)';
  } else if (userAgent.includes('insomnia')) {
    return 'Insomnia (API Testing)';
  } else if (userAgent.includes('curl')) {
    return 'cURL (Command Line)';
  } else if (userAgent.includes('axios')) {
    return 'Axios (HTTP Client)';
  } else if (userAgent.includes('fetch')) {
    return 'Fetch API';
  }
  
  // Extract browser for real browsers
  let browser = 'Unknown Browser';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    browser = 'Chrome';
  } else if (userAgent.includes('Firefox')) {
    browser = 'Firefox';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
  } else if (userAgent.includes('Edg')) {
    browser = 'Edge';
  }
  
  // Extract OS
  let os = 'Unknown OS';
  if (userAgent.includes('Windows NT 10.0')) {
    os = 'Windows 10/11';
  } else if (userAgent.includes('Windows NT 6.3')) {
    os = 'Windows 8.1';
  } else if (userAgent.includes('Windows')) {
    os = 'Windows';
  } else if (userAgent.includes('Mac OS X')) {
    os = 'macOS';
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS';
  }
  
  return `${browser} on ${os}`;
}