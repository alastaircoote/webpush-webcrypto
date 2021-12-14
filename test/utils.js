/**
 * @param {Function} func
 */
export async function shouldThrow(func) {
	const failError = new Error("Expected failure, didn't get one");
	try {
		await Promise.resolve(func);
		throw failError;
	} catch (err) {
		if (err === failError) {
			throw failError;
		}
	}
}
