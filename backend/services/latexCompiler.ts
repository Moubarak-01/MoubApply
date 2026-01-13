import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import util from 'util';

const execPromise = util.promisify(exec);

export const compileLatex = async (texContent: string, outputName: string): Promise<string> => {
  const tempDir = path.join(process.cwd(), 'temp_latex');
  const outputDir = path.join(process.cwd(), 'generated_pdfs');

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const texFilePath = path.join(tempDir, `${outputName}.tex`);
  const pdfFilePath = path.join(outputDir, `${outputName}.pdf`);

  // 1. Write the .tex file
  fs.writeFileSync(texFilePath, texContent);

  try {
    // 2. Run pdflatex (use full path to avoid PATH issues)
    const pdflatexPath = 'C:\\Users\\HP ELITEBOOK 840 G6\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe';
    const command = `"${pdflatexPath}" -interaction=nonstopmode -output-directory="${outputDir}" "${texFilePath}"`;

    console.log(`Compiling LaTeX: ${outputName}...`);
    try {
      await execPromise(command);
    } catch (e) {
      // Check if PDF was generated despite warnings/errors
      if (fs.existsSync(pdfFilePath)) {
        console.log("PDF generated with minor warnings.");
      } else {
        throw e;
      }
    }

    // Clean up temp files
    const extensions = ['.log', '.aux', '.out'];
    extensions.forEach(ext => {
      const file = path.join(outputDir, `${outputName}${ext}`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });

    return pdfFilePath;
  } catch (error: any) {
    const isMissingCommand = error.code === 'ENOENT';

    if (isMissingCommand) {
      console.warn("⚠️ LaTeX compiler (pdflatex) not found. Generating fallback PDF for testing.");
      // Create a dummy PDF file so the app doesn't crash
      const content = `%PDF-1.4
%âãÏÓ
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 100
>>
stream
BT
/F1 24 Tf
50 700 Td
(LaTeX not installed.) Tj
0 -50 Td
(This is a placeholder PDF.) Tj
0 -50 Td
(Flow continues...) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000157 00000 n
0000000355 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
455
%%EOF`;
      fs.writeFileSync(pdfFilePath, content);
      return pdfFilePath;
    }

    console.error('LaTeX Compilation Error:', error.stdout || error.message);
    throw new Error('Failed to generate PDF.');
  }
};