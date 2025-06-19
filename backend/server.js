import express from "express"
import multer from "multer"
import cors from "cors"
import dotenv from "dotenv";
import {GoogleGenerativeAI} from "@google/generative-ai"
import * as fs from "fs"
import archiver from "archiver"
import path from "path";



dotenv.config()

const port = 3000

//defining the SERVER

const app = express()
app.use(cors())

const genAI = new GoogleGenerativeAI(process.env.API_KEY)


const upload = multer({ dest: "uploads/" });

function test(path,mimeType){
    return{
        inlineData : {data: Buffer.from(fs.readFileSync(path)).toString("base64"),mimeType}
    }
}


app.post("/summarize", upload.array("pdf"), async (req, res) => {
  const files = req.files;
  const prompt = req.body.prompt;

  const filteredResumes = [];
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  for(let file of files){
    const base64 = fs.readFileSync(file.path).toString("base64")
    const imageParts = [test(file.path,"application/pdf")]

    try {
    const result = await model.generateContent([
      `You are assisting a recruiter in filtering resumes.\n
      This is what the recruiter is looking for : "${prompt}" \n
      Instructions:\n
      If you think the resume meets the above instructions, write @12409d at the start of your summary.\n
      If it does not, do not include @12409d in your output.
      `
      , ...imageParts]);
    const summary = await result.response.text();
    if(summary.toLowerCase().includes("@12409d")){filteredResumes.push(file.path)}
    } 
    catch (err) {
      console.error(err);
      res.status(500).send("Error processing the document");
    }
  }

  
  if (filteredResumes.length === 0) {
    // for (let f of files) fs.unlinkSync(path.resolve(f.path));
    for (let f of files) fs.unlinkSync(f.path);
    return res.status(204).send();
  }
  
  // Create ZIP of filtered resumes
  const archive = archiver("zip");
  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition": "attachment; filename=filtered_resumes.zip"
  });
  archive.pipe(res);

  for (let filePath of filteredResumes) {
    const originalFile = files.find(f => f.path === filePath);
    archive.file(filePath, { name: originalFile.originalname });
  }
  archive.finalize();


  // Optional: delete files after zipping (or use a cron job)
  archive.on("end", () => {
    for (let f of files) fs.unlink(f.path, () => {});
  })

});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
