/**
 * RFC 9457 Problem Details for HTTP APIs.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */

/** RFC 9457 Problem Details structure */
export interface ProblemDetails {
	/** URI reference identifying the problem type */
	type: string;
	/** Short, human-readable summary */
	title: string;
	/** HTTP status code */
	status: number;
	/** Human-readable explanation (optional) */
	detail?: string;
	/** URI reference to the specific occurrence (optional) */
	instance?: string;
}

/** Problem type identifiers for this gateway */
export const ProblemType = {
	/** Decapsulation failed (opaque - don't leak which step) */
	DECAPSULATION_FAILED: "decapsulation-failed",
	/** Request body too large */
	REQUEST_TOO_LARGE: "request-too-large",
	/** Invalid Content-Type header */
	INVALID_MEDIA_TYPE: "invalid-media-type",
	/** HTTP method not allowed */
	METHOD_NOT_ALLOWED: "method-not-allowed",
	/** Endpoint not implemented */
	NOT_IMPLEMENTED: "not-implemented",
	/** Internal server error */
	INTERNAL_ERROR: "internal-error",
} as const;

type ProblemTypeValue = (typeof ProblemType)[keyof typeof ProblemType];

const BASE_URI = "https://ohttp.info/problems";

/**
 * Create an RFC 9457 Problem Details response.
 */
export function problemResponse(
	status: number,
	problemType: ProblemTypeValue,
	title: string,
	detail?: string,
): Response {
	const problem: ProblemDetails = {
		type: `${BASE_URI}/${problemType}`,
		title,
		status,
		...(detail !== undefined && { detail }),
	};

	return new Response(JSON.stringify(problem), {
		status,
		headers: {
			"Content-Type": "application/problem+json",
		},
	});
}

/**
 * Opaque error for decryption failures.
 *
 * Returns identical response regardless of failure mode to prevent oracle attacks.
 * RFC 9458 §6 requires that decryption errors not leak information.
 */
export function opaqueDecryptionError(): Response {
	return problemResponse(
		400,
		ProblemType.DECAPSULATION_FAILED,
		"Request decapsulation failed",
	);
}

/** 413 Payload Too Large */
export function requestTooLarge(maxSize: number): Response {
	return problemResponse(
		413,
		ProblemType.REQUEST_TOO_LARGE,
		"Request body too large",
		`Maximum request size is ${maxSize} bytes`,
	);
}

/** 415 Unsupported Media Type */
export function invalidMediaType(expected: string): Response {
	return problemResponse(
		415,
		ProblemType.INVALID_MEDIA_TYPE,
		"Invalid Content-Type",
		`Expected ${expected}`,
	);
}

/** 405 Method Not Allowed */
export function methodNotAllowed(allowed: string[]): Response {
	const response = problemResponse(
		405,
		ProblemType.METHOD_NOT_ALLOWED,
		"Method not allowed",
		`Allowed methods: ${allowed.join(", ")}`,
	);
	response.headers.set("Allow", allowed.join(", "));
	return response;
}

/** 501 Not Implemented */
export function notImplemented(feature: string): Response {
	return problemResponse(
		501,
		ProblemType.NOT_IMPLEMENTED,
		"Not implemented",
		`${feature} is not yet available`,
	);
}

/** 500 Internal Server Error */
export function internalError(): Response {
	return problemResponse(
		500,
		ProblemType.INTERNAL_ERROR,
		"Internal server error",
	);
}
