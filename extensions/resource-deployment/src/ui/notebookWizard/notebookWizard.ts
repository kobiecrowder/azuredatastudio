/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { INotebookService, Notebook } from '../../services/notebookService';
import { IToolsService } from '../../services/toolsService';
import { Model } from '../model';
import { InputComponents, setModelValues } from '../modelViewUtils';
import { WizardBase } from '../wizardBase';
import { DeploymentType, NotebookWizardInfo } from './../../interfaces';
import { IPlatformService } from './../../services/platformService';
import { NotebookWizardAutoSummaryPage } from './notebookWizardAutoSummaryPage';
import { NotebookWizardPage } from './notebookWizardPage';

const localize = nls.loadMessageBundle();

export class NotebookWizard extends WizardBase<NotebookWizard, NotebookWizardPage, Model> {
	private _inputComponents: InputComponents = {};

	public get notebookService(): INotebookService {
		return this._notebookService;
	}

	public get platformService(): IPlatformService {
		return this._platformService;
	}

	public get wizardInfo(): NotebookWizardInfo {
		return this._wizardInfo;
	}

	public get inputComponents(): InputComponents {
		return this._inputComponents;
	}

	constructor(private _wizardInfo: NotebookWizardInfo, private _notebookService: INotebookService, private _platformService: IPlatformService, toolsService: IToolsService) {
		super(_wizardInfo.title, new Model(), toolsService);
		if (this._wizardInfo.codeCellInsertionPosition === undefined) {
			this._wizardInfo.codeCellInsertionPosition = 0;
		}
		this.wizardObject.doneButton.label = _wizardInfo.actionText || this.wizardObject.doneButton.label;
	}

	public get deploymentType(): DeploymentType | undefined {
		return this._wizardInfo.type;
	}

	protected initialize(): void {
		this.setPages(this.getPages());
		this.wizardObject.generateScriptButton.hidden = true;
		this.wizardInfo.actionText = this.wizardInfo.actionText || localize('notebookWizard.ScriptToNotebook', "Script to Notebook");
		this.wizardObject.doneButton.label = this.wizardInfo.actionText;
	}

	protected onCancel(): void {
	}

	protected async onOk(): Promise<void> {
		await setModelValues(this.inputComponents, this.model);
		const env: NodeJS.ProcessEnv = {};
		this.model.setEnvironmentVariables(env, (varName) => {
			const isPassword = !!this.inputComponents[varName]?.isPassword;
			return isPassword;
		});
		const notebook: Notebook = await this.notebookService.getNotebook(this.wizardInfo.notebook);
		// generate python code statements for all variables captured by the wizard
		const statements = this.model.getCodeCellContentForNotebook(
			this.toolsService.toolsForCurrentProvider,
			(varName) => {
				const isPassword = !!this.inputComponents[varName]?.isPassword;
				return !isPassword;
			}
		);
		// insert generated code statements into the notebook.
		notebook.cells.splice(
			this.wizardInfo.codeCellInsertionPosition ?? 0,
			0,
			{
				cell_type: 'code',
				source: statements,
				metadata: {},
				outputs: [],
				execution_count: 0
			}
		);
		try {
			if (this.wizardInfo.runNotebook) {
				this.notebookService.backgroundExecuteNotebook(this.wizardInfo.taskName, notebook, 'deploy', this.platformService, env);
			} else {
				Object.assign(process.env, env);
				const notebookPath = this.notebookService.getNotebookPath(this.wizardInfo.notebook);
				await this.notebookService.launchNotebookWithContent(notebookPath, JSON.stringify(notebook, undefined, 4));
			}
		} catch (error) {
			vscode.window.showErrorMessage(error);
		}
	}

	private getPages(): NotebookWizardPage[] {
		const pages: NotebookWizardPage[] = [];
		for (let pageIndex: number = 0; pageIndex < this.wizardInfo.pages.length; pageIndex++) {
			if (this.wizardInfo.pages[pageIndex].isSummaryPage && this.wizardInfo.isSummaryPageAutoGenerated) {
				// If we are auto-generating the summary page
				pages.push(new NotebookWizardAutoSummaryPage(this, pageIndex));
			} else {
				pages.push(new NotebookWizardPage(this, pageIndex));
			}
		}
		return pages;
	}
}
