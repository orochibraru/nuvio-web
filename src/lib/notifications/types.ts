export interface AdminNotification {
	kind: "custom_backend_seen";
	backendId: string;
	url: string;
}

export interface AdminNotifier {
	/** `adminUrl` is the admin page's address, for the email's button. */
	notify: (notification: AdminNotification, adminUrl: string) => Promise<void>;
}

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	html: string;
}

export interface MailSender {
	/** False when SMTP isn't configured or the send failed; never throws. */
	send: (message: MailMessage) => Promise<boolean>;
}
