import type antlr4 from 'antlr4';
import type { Lexer, Parser, ParserRuleContext, Token, CommonTokenStream } from 'antlr4';
import type { Ace } from 'ace-builds';
import type { AceSession, EditorWindow } from '../editor/widget.d';
import type mime from 'mime';
import type { AssetInspector } from './binary-magics.mjs';
import type { GithubWindow } from '../bundle/github.d';
import type { LocalWindow } from '../bundle/local.d';
import type { LanguageRuntime } from '../code/widget-languages';

export interface ImplementedBackend extends Mirror
{
	// [key: '']: any;
	languageKey: string | undefined;
	// activeFileId: string;
	setTimeout(ms: number): void;
	sender: ImplementedBackend;
	emit(name: string, data: any): void;
	doc: Ace.Document;
	// doc: {
	// 	getValue(): string;
	// 	setValue(value: string): void;
	// };
	deferredUpdate: {
		schedule(): void;
	};
}



export interface RosettaWorker extends Worker, EditorWindow, GithubWindow, LocalWindow
{
	window: Window | any;
	mime: typeof mime;
	TEXT_LANGUAGE_DETECTOR_WATERFALL: TextDetector[];
	ROSETTA_CROSS_LANGUAGE_MAPPING: Record<string, string[]>;
	GRAMMAR_CLASSIFIER_MATRIX: Record<string, string>;
	autodetectLanguage(fileText: string, fileBuffer: Buffer): string;
	resolveLanguageContext(fileId, fileText?: string, fileBuffer?: Uint8Array): Promise<string | undefined>;
	BINARY_DETECTOR: Record<string, BinaryDetector>;
	detectBinaryType(sourceBuffer: Buffer | Uint8Array): string;
	__missingHeaders: Set<string>;
	AntlrRegistry: { antlr4?: typeof antlr4; } & Record<string, typeof antlr4.Parser | typeof antlr4.Lexer>;
	AntlrLanguages: { antlr4?: typeof antlr4; } & Record<string, typeof antlr4.Parser | typeof antlr4.Lexer>;
	language: {
		lineToken(text: string, language: string, line: number): Promise<void>;
	};
	activeFileId?: string;
	activeFileSha?: string;
	antlr4: typeof antlr4;
	runParserPipeline(sourceText: string, languageKey: string, annotations: ParserEvent[], emitter: ImplementedBackend, fileId: string): any;
	extractCurrentBlock(codeStr: string, lineNumber: number, langId: string): BlockResult;
	antlrProcessor?: ImplementedBackend;
	executeGetFoldRegionsCommand(msg: { args: any[]; }, sender: ImplementedBackend): void;
	doc?: Ace.Document;
	languageKey?: string;
	AssetInspector?: typeof AssetInspector;
	hasSequentialBinaryRegex: RegExp;
	hexDump(sampleBytes: buffer, content: buffer, filePath: string, rowWidth?: number): string;
	process: any;
	activeSessions?: Record<string, AceSession>;
	loadLanguages?: () => Promise<LanguageRuntime[] | undefined>;
	languages?: LanguageRuntime[] | undefined;
	FS: {
		virtual: Record<string, FileRecord | null | undefined>;
		pointers?: ([number, string, FileRecord, string, number, number])[];
	};
	dirs: any;
	location: URL;
}


export interface DiagnosticBridge
{
	findLineInFile(filePath: string, token: string): number;
	findShaderByAssetDependency(assetPath: string): string;
	lookupShaderFile(shaderName: string): string;
}


export interface DisassemblyOptions
{
	globalOffset?: number;
	viewportStart?: number | null;
	viewportLength?: number | null;
	syscallMap?: Record<number, string>;
	forceMode?: string;
	codeStart?: number;
	codeLength?: number;
	dataStart?: number;
	dataLength?: number;
}

export interface DisassemblyOpcodes
{
	name: string;
	argLen: number;
	type: string;
}


export interface DisassemblyHeader
{
	magic: number;
	instructionCount: number;
	codeOffset: number;
	codeLength: number;
	dataOffset: number;
	dataLength: number;
	litLength: number;
	bssLength: number;
	jtrgLength?: number;
}

export interface FontGlyph
{
	index: number;
	char: string;
	height: number;
	top: number;
	bottom: number;
	pitch: number;
	xSkip: number;
	imageWidth: number;
	imageHeight: number;
	s: number;
	t: number;
	s2: number;
	t2: number;
	glyphHandle: number;
	shaderName: string;
}

export interface Q3Font
{
	glyphs: FontGlyph[];
	glyphScale: number;
	name: string;
}

export interface DiagnosticsParser
{
	filePath: string;
	row: number;
	type: string;
	text: string;
}

export interface TextDetector
{
	id: string;
	match: (s: string, b: Buffer | Uint8Array) => any;
}

export interface BinaryDetector
{
	description: string,
	match: (b: Uint8Array) => boolean;
}

export type FileClassDetector = (bytes: Uint8Array, path: string) => boolean;


export interface BlockDetector
{
	open: RegExp;
	close: string | RegExp;
	isKeywordClose: boolean;
}

export interface AntlrToken
{

	tokenIndex?: number;
	line?: number;
	column?: number;
	channel?: number;
	text?: string;
	value?: string;
	type?: number;
	start?: number | { line: number, column: number; };
	stop?: number | { line: number, column: number; };

	typeInt?: number | null;
	textType?: string;
	spellCheckable?: boolean;
	rosettaScope?: string;
	tokenType?: string;
	tokenMode?: string;
	tokenNames?: string[];
	tokenSymbol?: string;
	tokenRule?: string;
	symbolIndex?: number;
	symbolicName?: string;
	literalName?: string;
	literalText?: string;
	ruleName?: string;
	ruleHistory?: string[];
	contextNode?: ParserRuleContext;
	tokenChannel?: number;
	lexerSymbolicName?: string;
	lexerLiteralName?: string;

}


export type RosettaNeighbors = (t: AntlrToken, s: AntlrToken[]) => string | null | undefined;


export interface ParserEvent
{
	row: number,
	column: number,
	text: string,
	type: "error" | string;
}

export interface BlockResult
{
	text?: string;
	ruleName?: string;
	startLine: number;
	endLine: number;
	startIndex: number;
	endIndex: number;
}



export interface BlockRegionsResult
{
	fileId: string,
	blocks: BlockResult[];
}

export interface Mirror
{
	constructor(sender: any): Mirror;
	sender: any;
	doc: {
		getValue(): string;
		setValue(value: string): void;
	};
	setTimeout(timeout: number): void;
	onUpdate(): void;
	on(): void;
	callback(data: any, id: string): void;
	emit(name: string, data: any): void;
	call<E, P>(E: any, P: any): E & P;
}

declare module "ace/worker/mirror" {

}


export interface ErrorResult
{
	line: number;
	column: number;
	message: string;
}


export interface FoldRegion
{
	startRow: number;
	endRow: number;
	type: 'comment' | 'preprocessor' | 'brace';
}


export interface AntlrVocab
{
	getSymbolicNames(type: number): string[];
	getSymbolicName(type: number): string;
	getLiteralName(type: number): string;
}


export interface ImplementedLexer extends Lexer
{
	// @ts-ignore
	static vocabulary?: AntlrVocab;
	// @ts-ignore
	vocabulary?: AntlrVocab;
	symbolicNames?: Record<number, string>;
	literalNames?: Record<number, string>;
	modeNames?: Record<number, string>;
	_mode?: number;
}

export interface ImplementedParser extends Parser
{
	// @ts-ignore
	static vocabulary?: AntlrVocab;
	// @ts-ignore
	vocabulary?: AntlrVocab;
	ruleNames: Record<number, string>;
	// [key: string]: Function;
}


export interface ImplementedContext extends ParserRuleContext
{
	ruleIndex: number;
	line: number;
}


export interface ImplementedStream extends CommonTokenStream
{
	getTokens(start?: number, stop?: number): Token[];
}


export interface ImplementedClient // extends AntlrWorkerBackend
{
	activeMarkerIds?: number[];
	// activeSession?: AceSession | null;
	$worker?: Worker | null;
	attachToDocument?: (session: Ace.Document) => void;
	terminate?: () => void;
	forceTerminate?: () => void;
	setLanguageTarget?: (file: string) => void;
	on?: (event: string, callback: (response: MessageEvent) => void) => void;
}


export interface AceWorkerClient
{
	call: (worker: ImplementedClient, deps: string[], workerName: string, namespace: string, targetUrl: string) => void;
}


export interface HilightResult
{
	fileId: string,
	startLine: number,
	endLine: number,
	tokenLinesChunk: any[][],
	annotationsChunk: ParserEvent[];
}



export interface LanguageRuntime
{
	id: string;
	type?: 'programming' | 'data' | 'markup';
	color?: string;
	extensions?: string[];
	label: string;
	tm_scope?: string;
	ace_mode?: string;
	aceMissing?: boolean;
	languageId?: number;
	version: string;
	iconClass?: string;
	installed: boolean;
	subtext?: string;
	description?: string;
	grammars?: GitHubFileEntry[] | JSZip.JSZipObject[];
	antlrSupport?: boolean;
	antlrPercent?: number;
	antlrCount?: number;
	antlrTotal?: number;
}

