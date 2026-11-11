import { downmixInto } from "#lib/player/downmix.js";

declare class AudioWorkletProcessor {}
declare function registerProcessor(
	name: string,
	processor: new () => AudioWorkletProcessor,
): void;

registerProcessor(
	"stereo-downmix",
	class extends AudioWorkletProcessor {
		process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
			const planes = inputs[0];
			const [left, right] = outputs[0];
			if (planes.length > 0) {
				downmixInto(planes, left, right);
			}
			return true;
		}
	},
);
