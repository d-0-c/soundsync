// import bonjour from 'bonjour';

// export const scanForAirplaySinks = () => {
//   const detector = bonjour().find({
//     type: 'raop',
//     protocol: 'tcp',
//   });


//   detector.on('up', (e) => {
//     console.log(e);
//   });
// };

// scanForAirplaySinks();

import SoxrResampler, { SoxrDatatype } from 'wasm-audio-resampler';
import { AudioInstance } from '../utils';
import {
  OPUS_ENCODER_RATE, OPUS_ENCODER_CHUNK_DURATION, OPUS_ENCODER_CHUNK_SAMPLES_COUNT, MAX_LATENCY,
} from '../../utils/constants';
import { AirplaySinkDescriptor } from './sink_type';
import { AudioSink } from './audio_sink';
import { AudioSourcesSinksManager } from '../audio_sources_sinks_manager';
import { AudioChunkStreamOutput } from '../../utils/audio/chunk_stream';
import { AirplaySpeaker } from '../../utils/vendor_integrations/airplay/airplaySpeaker';
import { SAMPLE_RATE, CHANNELS } from '../../utils/vendor_integrations/airplay/airplayConstants';
import { CircularTypedArray } from '../../utils/circularTypedArray';

export class AirplaySink extends AudioSink {
  local: true = true;
  type: 'airplay' = 'airplay';

  host: string;
  port: number;
  private airplay: AirplaySpeaker;
  private buffer = new CircularTypedArray(Uint16Array, MAX_LATENCY * (SAMPLE_RATE / 1000) * Float32Array.BYTES_PER_ELEMENT * CHANNELS);
  private resampler = new SoxrResampler(CHANNELS, OPUS_ENCODER_RATE, SAMPLE_RATE, SoxrDatatype.SOXR_FLOAT32, SoxrDatatype.SOXR_INT16);

  constructor(descriptor: AirplaySinkDescriptor, manager: AudioSourcesSinksManager) {
    super(descriptor, manager);
    this.host = descriptor.host;
    this.port = descriptor.port;
    this.airplay = new AirplaySpeaker(this.host, this.port, () => this.getCurrentStreamTime() * (SAMPLE_RATE / 1000), this.getSample);
  }

  async _startSink() {
    this.log('Connecting to Airplay sink');
    await this.airplay.start();
  }

  private getSample = (offset: number, length: number) => this.buffer.get(offset, length)

  _stopSink = async () => {
    // if (this.closeHue) {
    //   await this.closeHue();
    // }
  }

  handleAudioChunk = (data: AudioChunkStreamOutput) => {
    const resampled = this.resampler.processChunk(data.chunk);
    if (!resampled.length) {
      return;
    }
    if (data.i !== this.lastReceivedChunkIndex + 1) {
      // will also be set at the start of stream because lastReceivedChunkIndex is -1 at init
      this.buffer.setWriterPointer(this.getCurrentStreamTime() * this.channels * SAMPLE_RATE);
    }
    this.buffer.setFromWriterPointer(new Uint16Array(resampled, resampled.byteOffset, resampled.byteLength / Uint16Array.BYTES_PER_ELEMENT));
  }

  toDescriptor = (sanitizeForConfigSave = false): AudioInstance<AirplaySinkDescriptor> => ({
    type: this.type,
    name: this.name,
    uuid: this.uuid,
    pipedFrom: this.pipedFrom,
    volume: this.volume,

    host: this.host,
    port: this.port,
    ...(!sanitizeForConfigSave && {
      peerUuid: this.peerUuid,
      instanceUuid: this.instanceUuid,
      latency: this.latency,
      available: this.available,
    }),
  })
}
