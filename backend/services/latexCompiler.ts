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
    // 2. Run pdflatex
    const command = `pdflatex -interaction=nonstopmode -output-directory="${outputDir}" "${texFilePath}"`;
    
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
    console.error('LaTeX Compilation Error:', error.stdout || error.message);
    throw new Error('Failed to generate PDF.');
  }
};