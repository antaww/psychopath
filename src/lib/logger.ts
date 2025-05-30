/**
 * Logging utility that handles environment-specific behavior
 * In production environment, logs will not be displayed in the browser console
 */

// Determine if we're in production mode
// In SvelteKit, when building for production, process.env.NODE_ENV will be 'production'
// This value is injected by Vite during the build process
export const isProduction = import.meta.env.PROD;

/**
 * Logger class that provides methods for different log levels
 * Will not output to console in production environment
 */
class Logger {
	/**
	 * Log a debug message (not shown in production)
	 */
	debug(message: string | object, ...args: any[]): void {
		if (isProduction) return;
		
		if (typeof message === 'string') {
			console.debug(message, ...args);
		} else {
			console.debug(message, ...args);
		}
	}

	/**
	 * Log an info message (not shown in production)
	 */
	info(message: string | object, ...args: any[]): void {
		if (isProduction) return;
		
		if (typeof message === 'string') {
			console.info(message, ...args);
		} else {
			console.info(message, ...args);
		}
	}

	/**
	 * Log a warning message (not shown in production)
	 */
	warn(message: string | object, ...args: any[]): void {
		if (isProduction) return;
		
		if (typeof message === 'string') {
			console.warn(message, ...args);
		} else {
			console.warn(message, ...args);
		}
	}

	/**
	 * Log an error message (always shown, even in production)
	 * Use only for critical errors that should be reported
	 */
	error(message: string | object, ...args: any[]): void {
		// Errors are important and should be logged even in production
		if (typeof message === 'string') {
			console.error(message, ...args);
		} else {
			console.error(message, ...args);
		}
	}

	/**
	 * Log a message (not shown in production)
	 */
	log(message: string | object, ...args: any[]): void {
		if (isProduction) return;
		
		if (typeof message === 'string') {
			console.log(message, ...args);
		} else {
			console.log(message, ...args);
		}
	}
}

// Export a singleton instance
export const logger = new Logger();

// Also export a function to override console globally
export function setupConsoleOverride(): void {
	// if (!browser) return; // browser is not defined in SvelteKit like this anymore
	if (typeof window === 'undefined') return; // Check if in browser context
	
	if (isProduction) {
		// In production, replace console methods with no-op functions
		// except for error which we keep for critical errors
		const noop = () => {};
		
		// Store original methods
		const originalConsole = {
			log: console.log,
			info: console.info,
			debug: console.debug,
			warn: console.warn
		};
		
		// Override console methods
		console.log = noop;
		console.info = noop;
		console.debug = noop;
		console.warn = noop;
		
		// Log that we've disabled console output
		originalConsole.log('Console output disabled in production environment');
	}
} 