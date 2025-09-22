import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

export interface DeviceFingerprint {
  fingerprint: string;
  userAgent: string;
  ip: string;
  acceptLanguage?: string;
  acceptEncoding?: string;
  timezone?: string;
  screenResolution?: string;
}

@Injectable()
export class DeviceFingerprintService {
  /**
   * Generate a device fingerprint from request headers
   */
  generateFingerprint(req: Request): DeviceFingerprint {
    const userAgent = req.get('user-agent') || '';
    const ip = this.getClientIP(req);
    const acceptLanguage = req.get('accept-language') || '';
    const acceptEncoding = req.get('accept-encoding') || '';
    const timezone = req.get('x-timezone') || '';
    const screenResolution = req.get('x-screen-resolution') || '';

    // Create a unique fingerprint based on multiple factors
    const fingerprintData = [
      userAgent,
      ip,
      acceptLanguage,
      acceptEncoding,
      timezone,
      screenResolution,
    ].join('|');

    const fingerprint = crypto
      .createHash('sha256')
      .update(fingerprintData)
      .digest('hex');

    return {
      fingerprint,
      userAgent,
      ip,
      acceptLanguage,
      acceptEncoding,
      timezone,
      screenResolution,
    };
  }

  /**
   * Get client IP address from request
   */
  private getClientIP(req: Request): string {
    // Check various headers for the real IP
    const xForwardedFor = req.get('x-forwarded-for');
    const xRealIP = req.get('x-real-ip');
    const cfConnectingIP = req.get('cf-connecting-ip'); // Cloudflare
    const xClientIP = req.get('x-client-ip');
    
    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      return xForwardedFor.split(',')[0].trim();
    }
    
    if (cfConnectingIP) {
      return cfConnectingIP;
    }
    
    if (xRealIP) {
      return xRealIP;
    }
    
    if (xClientIP) {
      return xClientIP;
    }

    // Fallback to connection remote address
    return req.socket.remoteAddress || req.ip || 'unknown';
  }

  /**
   * Check if two fingerprints are similar (for suspicious activity detection)
   */
  areFingerprintsSimilar(fingerprint1: DeviceFingerprint, fingerprint2: DeviceFingerprint): boolean {
    // Same IP but different fingerprint could be suspicious
    if (fingerprint1.ip === fingerprint2.ip && fingerprint1.fingerprint !== fingerprint2.fingerprint) {
      // Check if user agent is significantly different
      return this.areUserAgentsSimilar(fingerprint1.userAgent, fingerprint2.userAgent);
    }

    return fingerprint1.fingerprint === fingerprint2.fingerprint;
  }

  /**
   * Check if user agents are similar (different versions of same browser)
   */
  private areUserAgentsSimilar(ua1: string, ua2: string): boolean {
    if (!ua1 || !ua2) return false;
    
    // Extract browser name and major version
    const extractBrowserInfo = (ua: string) => {
      const chromeMatch = ua.match(/Chrome\/(\d+)/);
      const firefoxMatch = ua.match(/Firefox\/(\d+)/);
      const safariMatch = ua.match(/Safari\/(\d+)/);
      const edgeMatch = ua.match(/Edge\/(\d+)/);
      
      if (chromeMatch) return `Chrome/${chromeMatch[1]}`;
      if (firefoxMatch) return `Firefox/${firefoxMatch[1]}`;
      if (safariMatch) return `Safari/${safariMatch[1]}`;
      if (edgeMatch) return `Edge/${edgeMatch[1]}`;
      
      return ua.substring(0, 50); // Fallback to first 50 chars
    };

    const browser1 = extractBrowserInfo(ua1);
    const browser2 = extractBrowserInfo(ua2);
    
    return browser1 === browser2;
  }

  /**
   * Detect suspicious patterns in device fingerprints
   */
  detectSuspiciousPatterns(fingerprint: DeviceFingerprint): string[] {
    const suspiciousPatterns: string[] = [];

    // Check for automation tools
    if (this.isAutomationTool(fingerprint.userAgent)) {
      suspiciousPatterns.push('automation_tool');
    }

    // Check for missing standard headers
    if (!fingerprint.acceptLanguage || !fingerprint.acceptEncoding) {
      suspiciousPatterns.push('missing_headers');
    }

    // Check for suspicious IP patterns
    if (this.isSuspiciousIP(fingerprint.ip)) {
      suspiciousPatterns.push('suspicious_ip');
    }

    // Check for headless browser indicators
    if (this.isHeadlessBrowser(fingerprint.userAgent)) {
      suspiciousPatterns.push('headless_browser');
    }

    return suspiciousPatterns;
  }

  /**
   * Check if user agent indicates an automation tool
   */
  private isAutomationTool(userAgent: string): boolean {
    const automationKeywords = [
      'selenium', 'webdriver', 'automation', 'bot', 'crawler', 'spider',
      'scraper', 'phantom', 'nightmare', 'puppeteer', 'playwright',
      'curl', 'wget', 'postman', 'insomnia', 'httpie'
    ];

    const lowerUA = userAgent.toLowerCase();
    return automationKeywords.some(keyword => lowerUA.includes(keyword));
  }

  /**
   * Check for headless browser indicators
   */
  private isHeadlessBrowser(userAgent: string): boolean {
    const headlessKeywords = [
      'headless', 'phantomjs', 'chrome-headless-shell'
    ];

    const lowerUA = userAgent.toLowerCase();
    return headlessKeywords.some(keyword => lowerUA.includes(keyword));
  }

  /**
   * Check for suspicious IP addresses
   */
  private isSuspiciousIP(ip: string): boolean {
    // Check for local/private IPs in production
    const privateIPRanges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^127\./, // 127.0.0.0/8
      /^169\.254\./, // 169.254.0.0/16
      /^::1$/, // IPv6 localhost
      /^fe80:/, // IPv6 link-local
    ];

    // In production, private IPs behind proxy could be suspicious
    // In development, they're normal
    if (process.env.NODE_ENV === 'production') {
      return privateIPRanges.some(range => range.test(ip));
    }

    return false;
  }

  /**
   * Generate a session token that includes device fingerprint
   */
  generateSessionToken(userId: string, fingerprint: string): string {
    const timestamp = Date.now();
    const data = `${userId}:${fingerprint}:${timestamp}`;
    
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }
}