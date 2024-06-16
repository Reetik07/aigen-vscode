const vscode = require("vscode");
const OpenAI = require("openai").OpenAI;
const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");

const openai = new OpenAI({
  apiKey: process.env.openAIKey,
});

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand("aigen", async () => {
    const panel = vscode.window.createWebviewPanel(
      "projectConfig",
      "Project Configuration",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    const config = vscode.workspace.getConfiguration();
    const themeName = config.get("workbench.colorTheme");
    const config_file = themeName.toLowerCase().includes("dark")
      ? "config_dark.html"
      : "config.html";
    panel.webview.html = getWebviewContent(context, config_file);

    panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "configureProject":
          configureProject(
            message.projectName,
            message.projectDescription,
            message.framework
          );
          panel.dispose();
          break;
      }
    });
  });

  const provider = new aigenViewProvider(context.extensionUri);

  context.subscriptions.push(disposable);
  context.subscriptions.push(
    vscode.commands.registerCommand("modifyProject", () =>
      showInputBox(context)
    )
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("aigenView", provider)
  );
}

function deactivate() {}

class aigenViewProvider {
  resolveWebviewView(webviewView, context, _token) {
    webviewView.webview.options = {
      enableScripts: true,
    };

    const projectRoot = vscode.workspace.rootPath.replaceAll("\\", "/");
    const fileList = fs.readdirSync(projectRoot);

    webviewView.webview.html = this.getHtmlForInit(webviewView.webview);

    fileList.forEach((file) => {
      console.log(file);
      if (file.includes("aigen-config.json")) {
        webviewView.webview.html = this.getHtmlForExisting(webviewView.webview);
        return;
      }
    });
    // webviewView.webview.html = this.getHtmlForExisting(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.command) {
        case "newProject": {
          vscode.commands.executeCommand("aigen");
          break;
        }
        case "existingProject": {
          vscode.window
            .showOpenDialog({
              canSelectFolders: true,
              canSelectFiles: false,
              canSelectMany: false,
              openLabel: "Select Project Folder",
            })
            .then(async (uri) => {
              console.log(uri);
              const projectFolder = uri[0].fsPath;
              console.log(projectFolder);
              const fileList = fs.readdirSync(projectFolder);
              const git = await simpleGit(projectFolder);
              const isRepo = await git.checkIsRepo();
              if (!fileList.includes("aigen-config.json")) {
                console.log(projectFolder + "/aigen-config.json");
                fs.writeFileSync(
                  projectFolder + "/aigen-config.json",
                  JSON.stringify(
                    {
                      projectName: projectFolder
                        .replaceAll("\\", "/")
                        .replaceAll("//", "/")
                        .split("/")
                        .slice(-1)[0],
                      projectPath: projectFolder
                        .replaceAll("\\", "/")
                        .replaceAll("//", "/"),
                    },
                    null,
                    2
                  )
                );
                if (!fileList.includes(".gitignore")) {
                  fs.writeFileSync(
                    projectFolder + "/.gitignore",
                    "node_modules"
                  );
                }
                if (!isRepo) {
                  await git.init().add("./*").commit("Initial commit");
                } else {
                  await git.add("./*").commit("aigen configured");
                }
              }
              // vscode.commands.executeCommand(
              //   "vscode.openFolder",
              //   vscode.Uri.file(projectFolder),
              //   true
              // );
              vscode.commands.executeCommand(
                "vscode.openFolder",
                vscode.Uri.file(projectFolder),
                { forceReuseWindow: true }
              );
            });
          break;
        }
        case "modifyProject": {
          vscode.commands.executeCommand("modifyProject");
          break;
        }
        case "remoteRepo": {
          vscode.window
            .showOpenDialog({
              canSelectFolders: true,
              canSelectFiles: false,
              canSelectMany: false,
              openLabel: "Select Project Location",
            })
            .then(async (uri) => {
              console.log(data);
              const projectPath = uri[0].fsPath;
              console.log(projectPath);
              console.log(data.repoUrl);
              let git = simpleGit(projectPath);
              await git.clone(data.repoUrl).catch((error) => {
                vscode.window.showInformationMessage(error.message);
                console.log(error.message);
              });
              const repoName = data.repoUrl
                .split("/")
                .slice(-1)[0]
                .split(".")[0];
              const projectFolder =
                projectPath.replaceAll("\\", "/") + "/" + repoName;
              const fileList = fs.readdirSync(projectFolder);
              if (!fileList.includes("aigen-config.json")) {
                fs.writeFileSync(
                  projectFolder + "/aigen-config.json",
                  JSON.stringify(
                    {
                      projectName: projectFolder
                        .replaceAll("\\", "/")
                        .replaceAll("//", "/")
                        .split("/")
                        .slice(-1)[0],
                      projectPath: projectFolder
                        .replaceAll("\\", "/")
                        .replaceAll("//", "/"),
                    },
                    null,
                    2
                  )
                );
                if (!fileList.includes(".gitignore")) {
                  fs.writeFileSync(
                    projectFolder + "/.gitignore",
                    "node_modules"
                  );
                }
                let git = simpleGit(projectFolder);
                await git.add("./*").commit("aigen configured");
              }
              vscode.commands.executeCommand(
                "vscode.openFolder",
                vscode.Uri.file(projectFolder),
                { forceReuseWindow: true }
              );
            });
        }
      }
    });
  }

  getHtmlForInit(webview) {
    return `<!DOCTYPE html>
          <html lang="en">
          <head>
              <title>AIGEN</title>
          </head>
          <body>
            <!-- <div style="width: 100%; font-size: 20px; display: flex; justify-content: end"><div style="cursor: pointer;">&#x21bb;</div></div><br/> -->
            <div id="initDiv" style="display: block">
              In order to use the features, you can import an existing project or we will configure a new project for you.<br/>
              <button id="newProject" style="width: 100%; padding: 0.5rem; margin-top: 7%; background-color: #026ec1; color: white; border: 0; border-radius: 2px; cursor: pointer;">New Project</button><br/>
              <hr style="margin-top: 10%;"/>
              <button id="existingProject" style="width: 100%; padding: 0.5rem;  margin-top: 10%; background-color: #026ec1; color: white; border: 0; border-radius: 2px; cursor: pointer;">Import Existing Project</button><br/>
              <div style="display: flex; justify-content: center; margin-top: 5%;">OR</div>
              <!-- <button id="remoteRepo" style="width: 100%; padding: 0.5rem;  margin-top: 5%; background-color: #026ec1; color: white; border: 0; border-radius: 2px; cursor: pointer;">Import From Remote Repo</button><br/> -->
              <input id="repoUrl" type="text" placeholder="Enter Repo URL" style="width: auto; padding: 0.5rem; background-color: #181818; border: 1px solid white; color: white;" />
              <button id="remoteRepo" style="width: auto; padding: 0.5rem;  margin-top: 7%; background-color: #026ec1; color: white; border: 0; border-radius: 2px; cursor: pointer;">Import</button><br/>
            </div>
            <!--
            <div id="remoteRepoDiv" style="display: none">
              <div id="backButton" style="cursor: pointer; font-size: 15px;">&#129032;</div></br>
              <div style="width: 90%;">
                <input id="repoUrl" type="text" placeholder="Repo URL" style="width: auto; padding: 0.5rem; background-color: #181818; border: 1px solid white;" />
                <button id="remoteRepo" style="width: auto; padding: 0.5rem;  margin-top: 7%; background-color: #026ec1; color: white; border: 0; border-radius: 2px; cursor: pointer;">Import</button><br/>
              </div>
            </div>

            <script>
              const initDiv = document.getElementById("initDiv");
              const remoteRepoDiv = document.getElementById("remoteRepoDiv");
              
              document.getElementById("remoteRepo").addEventListener("click", () => {
                initDiv.style.display = "none";
                remoteRepoDiv.style.display = "block";
              });

              document.getElementById("backButton").addEventListener("click", () => {
                initDiv.style.display = "block";
                remoteRepoDiv.style.display = "none";
              });
              
            </script>
            -->
            
            <script>
              const vscode = acquireVsCodeApi();
              
              document.getElementById("newProject").addEventListener("click", () => {
                vscode.postMessage({
                  command: "newProject",
                });
              });
              
              document.getElementById("existingProject").addEventListener("click", () => {
                vscode.postMessage({
                  command: "existingProject",
                });
              });
              
              document.getElementById("remoteRepo").addEventListener("click", () => {
                const repoUrl = document.getElementById("repoUrl").value;
                vscode.postMessage({
                  command: "remoteRepo",
                  repoUrl: repoUrl,
                });
              });

            </script>
          </body>
          </html>`;
  }

  getHtmlForExisting(webview) {
    return `<!DOCTYPE html>
          <html lang="en">
          <head>
              <title>AIGEN</title>
          </head>
          <body>
            AIGEN is all set for this project!<br/> Click on the 'Modify Project' button to start implementing your ideas along with AIGEN.<br/>
            <button id="modifyProject" style="width: 100%; padding: 0.5rem;  margin-top: 7%; background-color: #026ec1; color: white; border: 0; border-radius: 2px; cursor: pointer;">Modify Project</button><br/>
            <script>
              const vscode = acquireVsCodeApi();

              document.getElementById("modifyProject").addEventListener("click", () => {
                vscode.postMessage({
                  command: "modifyProject",
                });
              });

            </script>
          </body>
          </html>`;
  }
}

aigenViewProvider.viewType = "aigen";

function configureProject(projectName, projectDescription, framework) {
  vscode.window.showInformationMessage(
    `Please wait while we configure the project.`
  );
  openai.chat.completions
    .create({
      messages: [
        {
          role: "user",
          content:
            `Please generate a code structure along with all codes which can be compiled properly without any errors. The code provided should also contain each files including the dependency file so that it should be executed successfully after setting up the project dependencies and starting the development server for the following use case:
                      ` +
            projectDescription +
            `
                    Use the following tech stack to do the same:
                    ` +
            framework +
            `
                    And it should contain each files that a ` +
            framework +
            ` project includes in order to run it.

                    Reply with a proper json string output mentioning each files path and code in a format such as: [{path: '', code:''}].
                    The path should start with the project folder name i.e. '` +
            projectName +
            `' in which the files are to be added.`,
        },
      ],
      model: "gpt-3.5-turbo",
    })
    .then(async (response) => {
      const root = vscode.workspace.rootPath.replaceAll("\\", "/") + "/";
      let projectFiles = [];
      try {
        projectFiles = JSON.parse(response.choices[0].message.content);
      } catch (err) {
        console.log("Ran into some error, trying again...");
        configureProject(projectName, projectDescription, framework);
        return;
      }
      projectFiles.forEach((item) => {
        let pathArray = item.path.split("/");
        if (pathArray.length > 1) {
          let directories = pathArray.slice(0, -1);
          let temp = root;
          directories.forEach((directory) => {
            temp += directory + "/";
            if (!fs.existsSync(temp)) {
              fs.mkdirSync(temp);
            }
          });
          console.log(item.path);
          fs.writeFileSync(root + item.path, item.code);
        }
      });
      console.log("writing .gitignore");
      fs.writeFileSync(root + projectName + "/.gitignore", "node_modules");
      fs.writeFileSync(
        root + projectName + "/aigen-config.json",
        JSON.stringify(
          {
            projectName: projectName,
            projectPath: root + projectName,
            techStack: framework,
          },
          null,
          2
        )
      );
      await simpleGit(root + projectName)
        .init()
        .add("./*")
        .commit("Initial commit");
      vscode.window.showInformationMessage(`Project files generated.`);
      vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(root + projectName),
        true
      );
    });
}

function getWebviewContent(context, file_name) {
  let configHtmlPath = vscode.Uri.file(
    path.join(context.extensionPath, file_name)
  );

  return fs.readFileSync(configHtmlPath.fsPath, "utf8");
}

async function showInputBox(context) {
  const panel = vscode.window.createWebviewPanel(
    "modifyProject",
    "Modify Project",
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
    }
  );

  const root = vscode.workspace.rootPath.replaceAll("\\", "/");
  const git = await simpleGit(root);
  const isRepo = await git.checkIsRepo();

  let updateHtmlContent = getWebviewContent(context, "update.html");

  if (isRepo) {
    updateHtmlContent = updateHtmlContent.replace(" display: '$display'", "");
    const branchSumaryResult = await git.branch();

    let htmlBranchOptions = "";
    branchSumaryResult.all.forEach((branch) => {
      if (branch === branchSumaryResult.current) {
        htmlBranchOptions +=
          '<option value="' + branch + '" selected>' + branch + "</option>";
      } else {
        htmlBranchOptions +=
          '<option value="' + branch + '">' + branch + "</option>";
      }
    });
    updateHtmlContent = updateHtmlContent.replace(
      "$options",
      htmlBranchOptions
    );
  } else {
    updateHtmlContent = updateHtmlContent.replace("'$display'", "none");
  }

  // panel.webview.html = htmlContent;
  panel.webview.html = updateHtmlContent;
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case "submitInput":
          getUpdatedCode(message);
          panel.dispose();
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

const exceptionDirectories = ["node_modules"];

function getFiles(dir, files = []) {
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = `${dir}/${file}`;
    if (!exceptionDirectories.includes(file)) {
      if (fs.statSync(name).isDirectory()) {
        getFiles(name, files);
      } else {
        let fileContent = fs.readFileSync(name, "utf8");
        files.push({
          path: name.replace(vscode.workspace.rootPath + "/", ""),
          content: fileContent,
        });
      }
    }
  }
  return files;
}

function getUpdatedCode(message) {
  vscode.window.showInformationMessage(
    `Please wait while update the project files.`
  );
  const codebase = JSON.stringify(getFiles(vscode.workspace.rootPath));
  let prompt = `
  Below is my codebase i have provided you as a json string in the format: [{path: '', content: ''}].
  ${codebase}

  ${message.userRequest}

  Reply with a proper json string output mentioning each files path and code in a format such as: [{path: '', code:''}] for only the files that needs to be updated or added. Do not reply with any other message except the json string output.
  `;
  openai.chat.completions
    .create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "gpt-3.5-turbo",
    })
    .then(async (response) => {
      const root = vscode.workspace.rootPath.replaceAll("\\", "/") + "/";
      const projectFiles = JSON.parse(response.choices[0].message.content);
      projectFiles.forEach((item) => {
        let pathArray = item.path.split("/");
        if (pathArray.length > 1) {
          let directories = pathArray.slice(0, -1);
          let temp = root;
          directories.forEach((directory) => {
            temp += directory + "/";
            if (!fs.existsSync(temp)) {
              fs.mkdirSync(temp);
            }
          });
          console.log(item.path);
          fs.writeFileSync(root + item.path, item.code);
        }
      });
      if (message.commit) {
        const gitRoot = vscode.workspace.rootPath.replaceAll("\\", "/");
        const git = await simpleGit(gitRoot);
        const branchData = await git.branch();
        if (message.newBranch) {
          await git.checkoutBranch(message.branchName, branchData.current);
        } else {
          await git.checkout(message.branchName);
        }
        await git.add("./*").commit(message.commitMessage);
        vscode.window.showInformationMessage(
          `Project files updated and committed.`
        );
      } else {
        vscode.window.showInformationMessage(`Project files updated.`);
      }
    });
}

module.exports = {
  activate,
  deactivate,
};
