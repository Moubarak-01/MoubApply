import fs from 'fs';
import path from 'path';
import { compileLatex } from './services/latexCompiler';

const test = async () => {
  console.log('--- Step 1: Testing LaTeX Compilation ---');
  
  const templatePath = path.join(__dirname, 'templates', 'master_resume.tex');
  const texContent = fs.readFileSync(templatePath, 'utf8');

  try {
    const pdfPath = await compileLatex(texContent, 'test_resume_generated');
    console.log(`✅ Success! PDF generated at: ${pdfPath}`);
    
    if (fs.existsSync(pdfPath)) {
        console.log('File verified on disk.');
    }
  } catch (err) {
    console.error('❌ Compilation failed.');
    console.error(err);
  }
};

test();
