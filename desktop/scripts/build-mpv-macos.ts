import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";

// Builds native/build/libnuvio-mpv.dylib on macOS: the in-window mpv view
// (native/macos/nuvio_mpv.m) linked statically against MPVKit's GPL build of
// libmpv and its dependencies, pinned below by MPVKit 1.1.0-n9.0.2's own
// SwiftPM checksums.

const ARCHIVES: { name: string; url: string; sha256: string }[] = [
	{
		name: "Libmpv-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libmpv-GPL.xcframework.zip",
		sha256: "a556746596c0c6fe88b1ef6182e6ddc25504617eba2d9ac538159098ceca3fb5",
	},
	{
		name: "Libavcodec-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libavcodec-GPL.xcframework.zip",
		sha256: "51863fa4b96dccc350fe4e3b125b7b71cd3728039baa3af87c7ea8b24f2bf61d",
	},
	{
		name: "Libavdevice-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libavdevice-GPL.xcframework.zip",
		sha256: "9cf58860173bc4f18551c4311753451f6f7f9b43bf0c1f88baf90ffd71b006f5",
	},
	{
		name: "Libavformat-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libavformat-GPL.xcframework.zip",
		sha256: "c17b70aeeb684adc02c88f11e63c3cac6e010809e1906504956d72057bbeda1d",
	},
	{
		name: "Libavfilter-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libavfilter-GPL.xcframework.zip",
		sha256: "8e0c5c8786fe86d8c08d854447cc3f15f6b83d2ca80c3c81c857b58ed01cbaf4",
	},
	{
		name: "Libavutil-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libavutil-GPL.xcframework.zip",
		sha256: "0d67f42a2f03f9fdec65b014fb438063dcfafcad64244a2152b35285e56c0f2e",
	},
	{
		name: "Libswresample-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libswresample-GPL.xcframework.zip",
		sha256: "faf081c9cf5b3e84c3a6ccdc076fca0f9e7db11b8c9713843bc91ccfad71ba7a",
	},
	{
		name: "Libswscale-GPL",
		url: "https://github.com/mpvkit/MPVKit/releases/download/1.1.0-n9.0.2/Libswscale-GPL.xcframework.zip",
		sha256: "cac0a48f8a8f3b7387042c0cdf9f642045c16d9fdad9e42280904040669d6e05",
	},
	{
		name: "Libcrypto",
		url: "https://github.com/mpvkit/openssl-build/releases/download/3.3.5/Libcrypto.xcframework.zip",
		sha256: "593283be2a90f7fd66f6e6ed331b2f099cf403e0926fe3b4ac09a7062b793965",
	},
	{
		name: "Libssl",
		url: "https://github.com/mpvkit/openssl-build/releases/download/3.3.5/Libssl.xcframework.zip",
		sha256: "ff5ffd43d015d7285fd37e4a3145b25cbd8d2842740bd629a711c299a20e226a",
	},
	{
		name: "gmp",
		url: "https://github.com/mpvkit/gnutls-build/releases/download/3.8.11/gmp.xcframework.zip",
		sha256: "ad33c7a08f4cdcb9924c8f0e6d9a054dad33d7794b97667bf8b6fb2b236ae585",
	},
	{
		name: "nettle",
		url: "https://github.com/mpvkit/gnutls-build/releases/download/3.8.11/nettle.xcframework.zip",
		sha256: "0fdf3ebf8bd7b8bc8eee837cf27261cb4c52ae520b6576a2f468656aa1691e02",
	},
	{
		name: "hogweed",
		url: "https://github.com/mpvkit/gnutls-build/releases/download/3.8.11/hogweed.xcframework.zip",
		sha256: "25727c9fa67287fa0a4f4722f88bb8be669b23cd7e837e2d00870eb8a25d3f27",
	},
	{
		name: "gnutls",
		url: "https://github.com/mpvkit/gnutls-build/releases/download/3.8.11/gnutls.xcframework.zip",
		sha256: "3dbec5809339189bf9679e218c6cff387ebf8fb72745927835afc2678f5c9f4d",
	},
	{
		name: "Libunibreak",
		url: "https://github.com/mpvkit/libass-build/releases/download/0.17.5/Libunibreak.xcframework.zip",
		sha256: "940d9833cf4477d0a260d9f2b4066125bc0ff7bbc111ac3c90e774765b77a559",
	},
	{
		name: "Libfreetype",
		url: "https://github.com/mpvkit/libass-build/releases/download/0.17.5/Libfreetype.xcframework.zip",
		sha256: "496ca62488530e14b1e4624d20ee2b237c0bd675cd70c19da578a5768302d02d",
	},
	{
		name: "Libfribidi",
		url: "https://github.com/mpvkit/libass-build/releases/download/0.17.5/Libfribidi.xcframework.zip",
		sha256: "bc15e097b892f2f90424e4a27ba287070cc2f98a74a4da10e6d2481d15cf5ff9",
	},
	{
		name: "Libharfbuzz",
		url: "https://github.com/mpvkit/libass-build/releases/download/0.17.5/Libharfbuzz.xcframework.zip",
		sha256: "aa8e0b9ca0387dac74e3e93c86e34d11982bb013b28022d0e6966a8427a35b2e",
	},
	{
		name: "Libass",
		url: "https://github.com/mpvkit/libass-build/releases/download/0.17.5/Libass.xcframework.zip",
		sha256: "3f4c576d2818ceb4544aa2a20e1f55846511c5e706fd19adc3ea9fd842270498",
	},
	{
		name: "Libsmbclient",
		url: "https://github.com/mpvkit/libsmbclient-build/releases/download/4.15.13-2512/Libsmbclient.xcframework.zip",
		sha256: "3a53375fab11bc888cc553664ea5dd902208d04f0cc21ec746302bf356246b6f",
	},
	{
		name: "Libbluray",
		url: "https://github.com/mpvkit/libbluray-build/releases/download/1.4.0/Libbluray.xcframework.zip",
		sha256: "bc037d34e2b0b5ab7f202fb371f5fb298136cc66fdf406c2172185d06f53f18d",
	},
	{
		name: "Libuavs3d",
		url: "https://github.com/mpvkit/libuavs3d-build/releases/download/1.2.1-fix/Libuavs3d.xcframework.zip",
		sha256: "bd5256081486d16c51c868d755bf70266c424b54c895269580de44ec6707f789",
	},
	{
		name: "Libdovi",
		url: "https://github.com/mpvkit/libdovi-build/releases/download/3.3.2/Libdovi.xcframework.zip",
		sha256: "e693e239808350868e79c5448ef9f02e2716bc822dd8632a41a368a1eae5ca7d",
	},
	{
		name: "MoltenVK",
		url: "https://github.com/mpvkit/moltenvk-build/releases/download/1.4.2/MoltenVK.xcframework.zip",
		sha256: "aee189c54ad7c62bf734a3dc51eb4cfad5685d1d63b0ec519ecd1b437c332418",
	},
	{
		name: "Libshaderc_combined",
		url: "https://github.com/mpvkit/libshaderc-build/releases/download/2025.5.0/Libshaderc_combined.xcframework.zip",
		sha256: "758047b615708575b580eb960a2d083f760a29dc462d6eaa360416c946ce433b",
	},
	{
		name: "lcms2",
		url: "https://github.com/mpvkit/lcms2-build/releases/download/2.17.0/lcms2.xcframework.zip",
		sha256: "dc0dce0606f6ab6841a8ec5a6bd4448e2f3ef00661a050460f806c9393dc6982",
	},
	{
		name: "Libplacebo",
		url: "https://github.com/mpvkit/libplacebo-build/releases/download/7.360.1/Libplacebo.xcframework.zip",
		sha256: "2fa3d54cb81f302d6f11c7b2f509af30944381c3b11ee9d35096eb4637a6e2dd",
	},
	{
		name: "Libdav1d",
		url: "https://github.com/mpvkit/libdav1d-build/releases/download/1.5.3/Libdav1d.xcframework.zip",
		sha256: "d1a32ae6a1f0193e9f05c44c9176844af7f6d2a58cb33843f6f1b8dfd9224083",
	},
	{
		name: "Libuchardet",
		url: "https://github.com/mpvkit/libuchardet-build/releases/download/0.0.8/Libuchardet.xcframework.zip",
		sha256: "ea4f548a230a755e059144657cc9e2ff563c1cdeae03974c38f8b6e1a40303fb",
	},
	{
		name: "Libluajit",
		url: "https://github.com/mpvkit/libluajit-build/releases/download/2.1.0-fix/Libluajit.xcframework.zip",
		sha256: "3a171ef1627fb88260893dc452f989bd93dd8510814771ba3aff7753470d3f3e",
	},
];

const FRAMEWORKS = [
	"AppKit",
	"AudioToolbox",
	"AudioUnit",
	"AVFoundation",
	"Cocoa",
	"CoreAudio",
	"CoreFoundation",
	"CoreMedia",
	"CoreVideo",
	"Foundation",
	"IOKit",
	"IOSurface",
	"Metal",
	"OpenGL",
	"QuartzCore",
	"Security",
	"SystemConfiguration",
	"VideoToolbox",
];
const LIBRARIES = ["bz2", "c++", "expat", "iconv", "m", "resolv", "xml2", "z"];

const desktop = join(import.meta.dir, "..");
const cache = join(desktop, ".cache", "mpvkit");
const output = join(desktop, "native", "build", "libnuvio-mpv.dylib");

function run(command: string[]) {
	const result = Bun.spawnSync(command, {
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0) {
		throw new Error(`${command[0]} exited with ${result.exitCode}`);
	}
}

/** The archive's macOS slice: its static library and headers. */
async function macosSlice(archive: (typeof ARCHIVES)[number]) {
	const zip = join(cache, `${archive.name}.zip`);
	if (!existsSync(zip)) {
		const response = await fetch(archive.url);
		if (!response.ok) {
			throw new Error(`${archive.name}: download failed (${response.status})`);
		}
		await Bun.write(zip, response);
	}
	const digest = createHash("sha256").update(readFileSync(zip)).digest("hex");
	if (digest !== archive.sha256) {
		rmSync(zip);
		throw new Error(`${archive.name}: digest mismatch (${digest})`);
	}
	const dir = join(cache, archive.name);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
		// Only the macOS slice: the archives hold every Apple platform, about
		// 1.4 GB unpacked, which runs a CI runner out of disk.
		run(["unzip", "-q", "-o", zip, "*/macos-*", "-d", dir]);
	}
	const xcframework = readdirSync(dir).find((name) =>
		name.endsWith(".xcframework"),
	);
	if (!xcframework) {
		throw new Error(`${archive.name}: no xcframework`);
	}
	const sliceName = readdirSync(join(dir, xcframework)).find((name) =>
		name.startsWith("macos-"),
	);
	if (!sliceName) {
		throw new Error(`${archive.name}: no macOS slice`);
	}
	const slice = join(dir, xcframework, sliceName);
	const framework = readdirSync(slice).find((name) =>
		name.endsWith(".framework"),
	);
	if (framework) {
		const binary = join(
			slice,
			framework,
			framework.replace(/\.framework$/, ""),
		);
		return { library: binary, headers: join(slice, framework, "Headers") };
	}
	const library = readdirSync(slice).find((name) => name.endsWith(".a"));
	if (!library) {
		throw new Error(`${archive.name}: no library in its macOS slice`);
	}
	return { library: join(slice, library), headers: join(slice, "Headers") };
}

if (process.platform !== "darwin") {
	throw new Error("The in-window mpv is macOS only for now");
}
mkdirSync(cache, { recursive: true });
const slices: { library: string; headers: string }[] = [];
for (const archive of ARCHIVES) {
	// biome-ignore lint/performance/noAwaitInLoops: one download at a time keeps the log readable
	slices.push(await macosSlice(archive));
}
// libmpv's headers expect to be included as <mpv/...>.
const include = join(cache, "include");
const mpvHeaders = slices[0].headers;
rmSync(include, { recursive: true, force: true });
mkdirSync(join(include, "mpv"), { recursive: true });
cpSync(
	existsSync(join(mpvHeaders, "mpv")) ? join(mpvHeaders, "mpv") : mpvHeaders,
	join(include, "mpv"),
	{ recursive: true },
);

// libmpv carries a Swift object: link the toolchain's Swift compatibility
// shims, and load the Swift runtime the OS ships.
const swiftc = Bun.spawnSync(["xcrun", "--find", "swiftc"])
	.stdout.toString()
	.trim();
const swiftLibraries = join(swiftc, "..", "..", "lib", "swift", "macosx");

mkdirSync(join(desktop, "native", "build"), { recursive: true });
const arch =
	process.env.ELECTROBUN_ARCH === "x64"
		? "x86_64"
		: process.arch === "x64"
			? "x86_64"
			: "arm64";
run([
	"clang",
	"-dynamiclib",
	"-fobjc-arc",
	"-DGL_SILENCE_DEPRECATION",
	"-O2",
	"-arch",
	arch,
	"-mmacosx-version-min=14.0",
	"-I",
	include,
	join(desktop, "native", "macos", "nuvio_mpv.m"),
	...slices.map((slice) => slice.library),
	...FRAMEWORKS.flatMap((name) => ["-framework", name]),
	...LIBRARIES.map((name) => `-l${name}`),
	`-L${swiftLibraries}`,
	"-L/usr/lib/swift",
	"-Wl,-rpath,/usr/lib/swift",
	"-Wl,-dead_strip",
	"-install_name",
	"@rpath/libnuvio-mpv.dylib",
	"-o",
	output,
]);
process.stdout.write(`built ${output}\n`);
