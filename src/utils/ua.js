/**
 * Simple, dependency-free User-Agent parser for basic session auditing.
 * @param {string} userAgentString 
 * @returns {{ browser: string, os: string, device: string }}
 */
export function parseUserAgent(userAgentString = "") {
    let browser = "Unknown Browser";
    let os = "Unknown OS";
    let device = "Desktop";

    const ua = userAgentString.toLowerCase();

    // 1. Device Category Detection
    if (/mobi|android|iphone|ipad|ipod/i.test(ua)) {
        device = "Mobile";
        if (/ipad/i.test(ua)) {
            device = "Tablet";
        }
    }

    // 2. OS Detection
    if (/windows/i.test(ua)) {
        os = "Windows";
    } else if (/macintosh|mac os x/i.test(ua)) {
        os = "macOS";
    } else if (/iphone|ipad|ipod/i.test(ua)) {
        os = "iOS";
    } else if (/android/i.test(ua)) {
        os = "Android";
    } else if (/linux/i.test(ua)) {
        os = "Linux";
    }

    // 3. Browser Detection
    if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) {
        browser = "Chrome";
    } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
        browser = "Safari";
    } else if (/firefox|fxios/i.test(ua)) {
        browser = "Firefox";
    } else if (/edge|edg/i.test(ua)) {
        browser = "Edge";
    } else if (/opr/i.test(ua)) {
        browser = "Opera";
    } else if (/msie|trident/i.test(ua)) {
        browser = "Internet Explorer";
    }

    return { browser, os, device };
}
