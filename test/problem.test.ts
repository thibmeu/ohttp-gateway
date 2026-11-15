import { OHTTPError, OHTTPErrorCode } from "ohttp-ts";
import { expect, it } from "vitest";
import { opaqueDecryptionError } from "../src/problem.ts";

it.each([OHTTPErrorCode.UnknownKeyId, OHTTPErrorCode.UnsupportedCipherSuite])(
	"signals key configuration error %s",
	async (code) => {
		const response = opaqueDecryptionError(new OHTTPError(code));
		expect(response.status).toBe(400);
		expect(response.headers.get("Content-Type")).toBe(
			"application/problem+json",
		);
		expect(await response.json()).toMatchObject({
			type: "https://iana.org/assignments/http-problem-types#ohttp-key",
		});
	},
);

it("keeps other failures opaque", async () => {
	const expected = await opaqueDecryptionError().text();
	for (const error of [
		new OHTTPError(OHTTPErrorCode.DecryptionFailed),
		new OHTTPError(OHTTPErrorCode.InvalidMessage),
		new Error("private details"),
	]) {
		expect(await opaqueDecryptionError(error).text()).toBe(expected);
	}
});
