export interface AdminNotification {
	kind: "custom_backend_seen";
	backendId: string;
	url: string;
}

export interface AdminNotifier {
	notify: (notification: AdminNotification) => Promise<void>;
}

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
}

export interface MailSender {
	/** False when SMTP isn't configured or the send failed; never throws. */
	send: (message: MailMessage) => Promise<boolean>;
}
