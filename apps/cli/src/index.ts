import { runProgram } from "./program";
import {
  formatForParseErrors,
  handleError,
  isStoredFileError,
} from "./utils/errors";

runProgram(process.argv.slice(2)).catch((error: unknown) => {
  if (isStoredFileError(error)) {
    handleError(
      error,
      "CORRUPT_FILE",
      formatForParseErrors(process.argv.slice(2))
    );
  }
  console.error(error);
  process.exit(1);
});
