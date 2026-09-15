/**
 * DRIVE-01 — Drive istemci portu (AGENTS ilke 5).
 *
 * Domain kodu (aynalama servisi) fetch'i doğrudan çağırmaz; yalnız bu arayüzü
 * bilir. Gerçek uygulaması {@link GoogleDriveAdapter}, testlerde sahte istemci.
 */
export interface DriveClientPort {
	/** Google onay ekranının adresi (scope: drive.file). */
	buildAuthorizeUrl(p: { state: string; redirectUri: string }): string;

	/** `code` → kalıcı refresh token + (varsa) bağlı hesabın e-postası. */
	exchangeCode(p: {
		code: string;
		redirectUri: string;
	}): Promise<{ refreshToken: string; email: string | null }>;

	/** Bağlı hesabın e-postası; Drive vermezse null (ölümcül değil). */
	accountEmail(p: { refreshToken: string }): Promise<string | null>;

	/**
	 * Adı verilen klasörü bulur, yoksa açar ve kimliğini döner.
	 * `parentId` null ise Drive kökünde.
	 */
	ensureFolder(p: { refreshToken: string; name: string; parentId: string | null }): Promise<string>;

	/** Klasörün hâlâ var olup olmadığı (kullanıcı elle silmiş olabilir). */
	folderExists(p: { refreshToken: string; folderId: string }): Promise<boolean>;

	/** multipart yükleme; dönen kimlik `drive_mirror_files.drive_file_id`. */
	uploadFile(p: {
		refreshToken: string;
		parentId: string;
		name: string;
		mimeType: string;
		body: Buffer;
	}): Promise<{ id: string }>;

	/** Kalıcı silme (KVKK); dosya zaten yoksa sessizce geçer. */
	deleteFile(p: { refreshToken: string; fileId: string }): Promise<void>;

	/** Kişi birleştirmede dosyayı hayatta kalanın klasörüne taşır. */
	moveFile(p: {
		refreshToken: string;
		fileId: string;
		fromParentId: string;
		toParentId: string;
	}): Promise<void>;
}

export const DRIVE_CLIENT = Symbol('DRIVE_CLIENT');

/** Uygulamanın Drive'da açtığı kök klasörün adı. */
export const DRIVE_ROOT_FOLDER_NAME = 'Verimaya Hastalar';

/** `tenant_settings` anahtarları — kök klasör kimliği ve son toplu gönderim özeti. */
export const DRIVE_ROOT_FOLDER_SETTING_KEY = 'drive.root_folder_id';
export const DRIVE_LAST_RUN_SETTING_KEY = 'drive.last_run';

/** `tenant_credentials.provider` değeri. */
export const DRIVE_CREDENTIAL_PROVIDER = 'google_drive';

export type DriveStoredSecret = {
	refreshToken: string;
	email: string | null;
};

export type DriveLastRun = {
	at: string;
	sent: number;
	skipped: number;
	failed: number;
};
