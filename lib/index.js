"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mainmenu_1 = require("@jupyterlab/mainmenu");
const apputils_1 = require("@jupyterlab/apputils");
const notebook_1 = require("@jupyterlab/notebook");
const filebrowser_1 = require("@jupyterlab/filebrowser");
const docmanager_1 = require("@jupyterlab/docmanager");
require("../style/index.css");
/**
 * The mimetype used for Jupyter cell data.
 */
const JUPYTER_ATTACHMENTS_MIME = 'application/vnd.jupyter.attachments';
var CommandIDs;
(function (CommandIDs) {
    CommandIDs.cutCellAttachments = 'notebook:cut-cell-attachment';
    CommandIDs.copyCellAttachments = 'notebook:copy-cell-attachment';
    CommandIDs.pasteCellAttachments = 'notebook:paste-cell-attachment';
    CommandIDs.insertImage = 'notebook:insert-image';
    CommandIDs.insertImageFromFileBrowser = 'notebook:insert-image-from-file-browser';
    CommandIDs.insertImageFromFileBrowser2 = 'notebook:insert-image-from-file-browser2';
})(CommandIDs || (CommandIDs = {}));
/**
 * Test whether the given ICellModel is an IAttachmentsCellModel.
 */
function cellModelIsIAttachmentsCellModel(model) {
    return model.attachments !== undefined;
}
/**
 * Test whether there is an active notebook.
 */
function activeNotebookExists(app, tracker) {
    return (tracker.currentWidget !== null &&
        tracker.currentWidget === app.shell.currentWidget);
}
/**
 * Return active cell if only single cell is selected, otherwise return null.
 */
function getActiveCellIfSingle(tracker) {
    const { content } = tracker.currentWidget;
    // If there are selections that are not the active cell,
    // this command is confusing, so disable it.
    const index = content.activeCellIndex;
    for (let i = 0; i < content.widgets.length; ++i) {
        if (content.isSelected(content.widgets[i]) && i !== index) {
            return null;
        }
    }
    return content.activeCell;
}
/**
 * Cut or copy attachments from cell, depending upon flag.
 */
function cutOrCopyAttachments(notebook, cut = false) {
    const model = notebook.activeCell.model;
    if (!cellModelIsIAttachmentsCellModel(model))
        return;
    const clipboard = apputils_1.Clipboard.getInstance();
    const attachmentCells = notebook.widgets.filter(cell => notebook.isSelectedOrActive(cell)).filter(cell => cellModelIsIAttachmentsCellModel(cell.model));
    notebook.mode = 'command';
    clipboard.clear();
    // Copy attachments
    const attachmentsJSONArray = attachmentCells.map(cell => cell.model.attachments.toJSON());
    clipboard.setData(JUPYTER_ATTACHMENTS_MIME, attachmentsJSONArray);
    if (cut) {
        // Clear attachments
        attachmentCells.forEach(cell => {
            cell.model.attachments.clear();
        });
    }
    notebook.deselectAll();
}
/**
 * Insert Markdown code to embed image attachment.
 */
function insertImageFromAttachment(attachmentName, cellModel) {
    // Markdown template string to insert image
    const markdown = `![${attachmentName}](attachment:${attachmentName})`;
    cellModel.value.insert(cellModel.value.text.length, markdown);
}
/**
 * Create cell attachment from IFileModel
 */
function createAttachmentFromFileModel(fileModel, cellModel) {
    // Create MIMEBundle
    const { name, mimetype, content } = fileModel;
    const bundle = {};
    bundle[mimetype] = content;
    cellModel.attachments.set(name, bundle);
}
/**
 * Initialization data for the jupyterlab-attachments extension.
 */
const extension = {
    id: 'jupyterlab-attachments',
    autoStart: true,
    requires: [apputils_1.ICommandPalette, mainmenu_1.IMainMenu, notebook_1.INotebookTracker, docmanager_1.IDocumentManager, filebrowser_1.IFileBrowserFactory],
    activate: (app, palette, mainMenu, notebookTracker, docManager, fileBrowserFactory) => {
        console.log('JupyterLab extension jupyterlab-attachments is activated!');
        function canAddImage() {
            if (!activeNotebookExists(app, notebookTracker))
                return false;
            // Can only have one active cell
            const activeCell = getActiveCellIfSingle(notebookTracker);
            if (activeCell === null)
                return false;
            // Must be a markdown cell (supporting attachments)
            return activeCell.model.type == "markdown";
        }
        app.commands.addCommand(CommandIDs.insertImage, {
            label: 'Insert Image',
            isEnabled: canAddImage,
            execute: () => {
                if (!canAddImage()) {
                    return;
                }
                const cellModel = notebookTracker.activeCell.model;
                if (!cellModelIsIAttachmentsCellModel(cellModel))
                    return;
                // Dialogue to request path of image
                docmanager_1.getOpenPath(docManager.services.contents).then(path => {
                    if (!path) {
                        return;
                    }
                    // Load image from path
                    docManager.services.contents.get(path, {
                        content: true,
                        type: "file", format: "base64"
                    }).then(fileModel => {
                        createAttachmentFromFileModel(fileModel, cellModel);
                        insertImageFromAttachment(fileModel.name, cellModel);
                    }, () => {
                        console.log(`jupyterlab-attachments: Error, couldn't open path ${path}`);
                    });
                });
            }
        });
        /**
         * Test whether the cell attachment commands (cut, copy, paste) are enabled
         */
        function hasSelectedCells() {
            if (!activeNotebookExists(app, notebookTracker))
                return false;
            const content = notebookTracker.currentWidget.content;
            const selectedOrActiveCells = content.widgets.filter(cell => content.isSelectedOrActive(cell));
            return selectedOrActiveCells.length > 0;
        }
        app.commands.addCommand(CommandIDs.cutCellAttachments, {
            label: 'Cut Cell Attachments',
            isEnabled: hasSelectedCells,
            execute: () => {
                if (hasSelectedCells()) {
                    cutOrCopyAttachments(notebookTracker.currentWidget.content, true);
                }
            }
        });
        app.commands.addCommand(CommandIDs.copyCellAttachments, {
            label: 'Copy Cell Attachments',
            isEnabled: hasSelectedCells,
            execute: () => {
                if (hasSelectedCells()) {
                    cutOrCopyAttachments(notebookTracker.currentWidget.content);
                }
            }
        });
        app.commands.addCommand(CommandIDs.pasteCellAttachments, {
            label: 'Paste Cell Attachments',
            isEnabled: () => {
                const clipboard = apputils_1.Clipboard.getInstance();
                if (!clipboard.hasData(JUPYTER_ATTACHMENTS_MIME)) {
                    return false;
                }
                return hasSelectedCells();
            },
            execute: () => {
                const clipboard = apputils_1.Clipboard.getInstance();
                if (!clipboard.hasData(JUPYTER_ATTACHMENTS_MIME)) {
                    return;
                }
                if (!hasSelectedCells()) {
                    return;
                }
                const notebook = notebookTracker.currentWidget.content;
                const attachmentCells = notebook.widgets.filter(cell => notebook.isSelectedOrActive(cell)).filter(cell => cellModelIsIAttachmentsCellModel(cell.model));
                notebook.mode = 'command';
                // Paste attachments from all sources, for all targets
                const attachmentData = clipboard.getData(JUPYTER_ATTACHMENTS_MIME);
                attachmentData.forEach(data => {
                    attachmentCells.forEach(cell => {
                        Object.keys(data).forEach(key => {
                            const model = cell.model;
                            model.attachments.set(key, data[key]);
                        });
                    });
                });
                notebook.deselectAll();
            }
        });
        function insertFromFileBrowserIsActive() {
            const widget = notebookTracker.currentWidget;
            if (!widget) {
                return false;
            }
            const browser = fileBrowserFactory.tracker.currentWidget;
            const fileModel = browser.selectedItems().next();
            if (fileModel === undefined) {
                return false;
            }
            if (fileModel.mimetype === null || !fileModel.mimetype.includes("image")) {
                return false;
            }
            const activeCell = widget.content.activeCell;
            return cellModelIsIAttachmentsCellModel(activeCell.model);
        }
        app.commands.addCommand(CommandIDs.insertImageFromFileBrowser, {
            execute: () => {
                if (!insertFromFileBrowserIsActive())
                    return;
                const widget = notebookTracker.currentWidget;
                const browser = fileBrowserFactory.tracker.currentWidget;
                const fileModel = browser.selectedItems().next();
                const cellModel = widget.content.activeCell.model;
                if (!cellModelIsIAttachmentsCellModel(cellModel)) {
                    return;
                }
                let content = fileModel.content;
                let promise;
                // If missing, load contents from file
                if (content === null) {
                    promise = docManager.services.contents.get(fileModel.path, {
                        content: true,
                        type: "file",
                        format: "base64"
                    });
                }
                else {
                    promise = Promise.resolve(fileModel);
                }
                // Create attachment from file and insert into markdown cell
                return promise.then(fileModel => {
                    createAttachmentFromFileModel(fileModel, cellModel);
                    insertImageFromAttachment(fileModel.name, cellModel);
                }, () => {
                    console.log(`jupyterlab-attachments: Error, couldn't open path ${fileModel.path}`);
                });
            },
            isVisible: insertFromFileBrowserIsActive,
            iconClass: 'jp-MaterialIcon jp-AddIcon',
            label: 'Insert Image as Attachment',
            mnemonic: 0
        });
        app.commands.addCommand(CommandIDs.insertImageFromFileBrowser2, {
            execute: () => {
                const widget = notebookTracker.currentWidget;
                if (!widget) {
                    return;
                }
                console.log(widget);
            },
            iconClass: 'jp-MaterialIcon jp-AddIcon',
            label: 'Attach to Active Cell',
            mnemonic: 0
        });
        // Add to main menu
        const cellAttachmentActionsGroup = [CommandIDs.cutCellAttachments,
            CommandIDs.copyCellAttachments,
            CommandIDs.pasteCellAttachments].map(command => {
            return { command };
        });
        mainMenu.editMenu.addGroup(cellAttachmentActionsGroup, 10);
        // Add to edit menu
        const insertImageGroup = [CommandIDs.insertImage].map(command => {
            return { command };
        });
        mainMenu.editMenu.addGroup(insertImageGroup, 11);
        // Add to command palette
        const category = 'Notebook Cell Operations';
        [
            CommandIDs.insertImage, CommandIDs.copyCellAttachments, CommandIDs.cutCellAttachments, CommandIDs.pasteCellAttachments
        ].forEach(command => {
            palette.addItem({ command, category });
        });
        // matches only non-directory items
        const selectorNotDir = '.jp-DirListing-item[data-isdir="false"]';
        app.contextMenu.addItem({
            command: CommandIDs.insertImageFromFileBrowser,
            selector: selectorNotDir,
            rank: 1
        });
    }
};
exports.default = extension;
