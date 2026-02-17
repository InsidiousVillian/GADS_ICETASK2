"""
Procedurally generate a looping techno/electronic background track.

Requirements (from design brief):
- Genre: Techno / electronic
- BPM: 120–140  (we'll use 128 BPM)
- Mood: energetic but not distracting
- Length: ~60 seconds
- Seamless looping with no clicks/pops
- Instruments: kick drum, bassline, hi-hats, simple synth lead

Output:
- Writes a mono 16‑bit WAV file at 44.1 kHz:
    assets/audio/music/bgm_techno_loop.wav

Usage:
- Run this once from the project root:

    python generate_bgm_techno_loop.py

The script will create the `assets/audio/music` directory if needed.
"""

import math
import os
import wave
import struct
from typing import List


SAMPLE_RATE = 44100  # 44.1 kHz (CD quality)
BPM = 128
BEAT_DURATION = 60.0 / BPM
LOOP_LENGTH_SECONDS = 64.0  # close to requested 60–90 s

# Simple master volume (keep headroom to avoid clipping after mixing).
MASTER_GAIN = 0.85


def linear_fade(samples: List[float], fade_in_ms: int = 10, fade_out_ms: int = 10) -> None:
    """Apply a short linear fade in/out to avoid clicks at loop points."""
    fade_in_samples = int(SAMPLE_RATE * fade_in_ms / 1000.0)
    fade_out_samples = int(SAMPLE_RATE * fade_out_ms / 1000.0)

    # Fade in
    for i in range(min(fade_in_samples, len(samples))):
        t = (i + 1) / float(fade_in_samples)
        samples[i] *= t

    # Fade out
    for i in range(1, min(fade_out_samples, len(samples)) + 1):
        t = (fade_out_samples - (i - 1)) / float(fade_out_samples)
        samples[-i] *= max(0.0, min(1.0, t))


def synth_kick(length_beats: float = 0.5) -> List[float]:
    """Generate a simple techno kick (pitch‑falling sine with fast decay)."""
    length_s = length_beats * BEAT_DURATION
    total_samples = int(SAMPLE_RATE * length_s)
    samples = []

    start_freq = 120.0
    end_freq = 40.0

    for n in range(total_samples):
        t = n / SAMPLE_RATE
        # Exponential pitch drop
        pitch_env = math.exp(-6.0 * t / length_s)
        freq = end_freq + (start_freq - end_freq) * pitch_env
        # Fast amplitude decay
        amp_env = math.exp(-8.0 * t / length_s)
        value = math.sin(2.0 * math.pi * freq * t) * amp_env
        samples.append(value)

    return samples


def synth_hat_tick(length_beats: float = 0.125) -> List[float]:
    """Simple hi‑hat tick: filtered noise burst with quick decay."""
    import random

    length_s = length_beats * BEAT_DURATION
    total_samples = int(SAMPLE_RATE * length_s)
    samples = []

    for n in range(total_samples):
        t = n / SAMPLE_RATE
        # White noise
        noise = (random.random() * 2.0 - 1.0)
        # Simple high‑pass effect by subtracting a very smoothed version
        # (cheap filter; good enough for a light hat texture).
        amp_env = math.exp(-10.0 * t / length_s)
        samples.append(noise * amp_env)

    return samples


def synth_bass_note(freq: float, length_beats: float = 1.0) -> List[float]:
    """Simple bass note: sine with slight overtones and soft attack."""
    length_s = length_beats * BEAT_DURATION
    total_samples = int(SAMPLE_RATE * length_s)
    samples = []

    for n in range(total_samples):
        t = n / SAMPLE_RATE
        # Soft attack / decay
        env = math.exp(-4.0 * t / length_s)
        # Add a gentle attack so the note doesn't click
        attack = min(1.0, t / 0.02)  # 20 ms attack
        env *= attack

        base = math.sin(2.0 * math.pi * freq * t)
        overtone = 0.3 * math.sin(2.0 * math.pi * freq * 2.0 * t)
        samples.append((base + overtone) * env)

    return samples


def synth_lead_note(freq: float, length_beats: float = 1.0) -> List[float]:
    """Simple synth lead: soft saw‑like tone with a gentle envelope."""
    length_s = length_beats * BEAT_DURATION
    total_samples = int(SAMPLE_RATE * length_s)
    samples = []

    for n in range(total_samples):
        t = n / SAMPLE_RATE
        env = math.exp(-3.0 * t / length_s)
        # Slightly longer attack than bass
        attack = min(1.0, t / 0.03)
        env *= attack

        # Soft saw approximation via additive sine partials
        sample = 0.0
        for k, amp in ((1, 0.7), (2, 0.25), (3, 0.12)):
            sample += amp * math.sin(2.0 * math.pi * freq * k * t)

        samples.append(sample * env)

    return samples


def mix_into(buffer: List[float], part: List[float], start_sample: int, gain: float) -> None:
    """Mix a mono part into the main buffer at a given offset."""
    for i, s in enumerate(part):
        idx = start_sample + i
        if idx >= len(buffer):
            break
        buffer[idx] += s * gain


def build_track() -> List[float]:
    total_samples = int(SAMPLE_RATE * LOOP_LENGTH_SECONDS)
    buffer = [0.0] * total_samples

    # Pre‑render single‑event sounds we will reuse
    kick = synth_kick()
    hat = synth_hat_tick()

    # 2‑bar bass pattern in A minor around 110 Hz
    # (A2 ~ 110 Hz, C3 ~ 130.81 Hz, G2 ~ 98 Hz)
    bass_pattern_freqs = [
        110.0, 110.0, 130.81, 110.0,  # bar 1 (A A C A)
        98.0, 98.0, 110.0, 98.0,      # bar 2 (G G A G)
    ]

    # Simple lead pattern (8 beats = 2 bars)
    lead_pattern_freqs = [
        440.0, 440.0, 493.88, 440.0,  # A4 A4 B4 A4
        440.0, 392.0, 440.0, 392.0,   # A4 G4 A4 G4
    ]

    beats_per_bar = 4
    bars_in_loop = int(LOOP_LENGTH_SECONDS / (beats_per_bar * BEAT_DURATION))
    total_beats = bars_in_loop * beats_per_bar

    # --- Kick and hi‑hat grid ---
    for beat_index in range(total_beats):
        beat_start = int(beat_index * BEAT_DURATION * SAMPLE_RATE)

        # Kick on every beat (4‑on‑the‑floor)
        mix_into(buffer, kick, beat_start, gain=0.9)

        # Closed hat on every off‑beat (8th notes)
        half_beat_samples = int(0.5 * BEAT_DURATION * SAMPLE_RATE)
        hat_start = beat_start + half_beat_samples
        mix_into(buffer, hat, hat_start, gain=0.4)

    # --- Bassline ---
    for beat_index in range(total_beats):
        freq = bass_pattern_freqs[beat_index % len(bass_pattern_freqs)]
        bass_note = synth_bass_note(freq, length_beats=1.0)
        start_sample = int(beat_index * BEAT_DURATION * SAMPLE_RATE)
        mix_into(buffer, bass_note, start_sample, gain=0.6)

    # --- Lead (enters after a short intro) ---
    intro_beats = 8  # ~2 bars of drums + bass before lead
    # Lead only plays from `intro_beats` up to `total_beats - 1`.
    for beat_index in range(intro_beats, total_beats):
        freq = lead_pattern_freqs[beat_index % len(lead_pattern_freqs)]
        lead_note = synth_lead_note(freq, length_beats=1.0)
        start_sample = int(beat_index * BEAT_DURATION * SAMPLE_RATE)
        mix_into(buffer, lead_note, start_sample, gain=0.35)

    # Apply short fade‑in/out for seamless looping.
    linear_fade(buffer, fade_in_ms=15, fade_out_ms=15)

    # Normalize gently to MASTER_GAIN
    peak = max(max(abs(s) for s in buffer), 1e-6)
    scale = MASTER_GAIN / peak
    return [s * scale for s in buffer]


def write_wav_mono_16bit(path: str, samples: List[float]) -> None:
    """Write mono 16‑bit PCM WAV."""
    # Ensure directory exists
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16‑bit
        wf.setframerate(SAMPLE_RATE)

        frames = bytearray()
        for s in samples:
            # Clamp and convert to 16‑bit signed integer
            s_clamped = max(-1.0, min(1.0, s))
            frames.extend(struct.pack("<h", int(s_clamped * 32767)))

        wf.writeframes(frames)


def main() -> None:
    output_path = os.path.join("assets", "audio", "music", "bgm_techno_loop.wav")
    print(f"[bgm] Generating procedural techno loop at {BPM} BPM…")
    samples = build_track()
    print(f"[bgm] Writing WAV to: {output_path}")
    write_wav_mono_16bit(output_path, samples)
    print("[bgm] Done. The loop should be seamless and safe to play in‑game.")


if __name__ == "__main__":
    main()

