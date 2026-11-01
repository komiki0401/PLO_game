"""Optional asset generation only: not needed for npm install/build or gameplay.
Use kokoro==0.9.4, misaki[ja]==0.9.4, transformers<5, torch CPU, soundfile,
and ffmpeg. Model and synthetic Japanese female voice: Apache-2.0.
"""
from pathlib import Path
import argparse
import json
import subprocess
import tempfile
import numpy as np
import torch
import soundfile as sf
from huggingface_hub import hf_hub_download
import unidic
import unidic_lite
# Use the bundled lightweight dictionary instead of requiring a 2GB download.
unidic.DICDIR = unidic_lite.DICDIR
from kokoro import KModel, KPipeline

REVISION = 'f3ff3571791e39611d31c381e3a41a3af07b4987'
REPO = 'hexgrad/Kokoro-82M'
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio/voice'
NAMES = ['ハイカード','ワンペア','ツーペア','スリーカード','ストレート','フラッシュ','フルハウス','フォーカード','ストレートフラッシュ']
parser=argparse.ArgumentParser()
parser.add_argument('--actions-only',action='store_true')
args=parser.parse_args()
torch.set_num_threads(2)
def get(filename):
    return hf_hub_download(REPO, filename=filename, revision=REVISION)
model = KModel(repo_id=REPO, config=get('config.json'), model=get('kokoro-v1_0.pth')).to('cpu').eval()
pipeline = KPipeline(lang_code='j',repo_id=REPO,model=model,device='cpu')
voice=get('voices/jf_alpha.pt')
OUT.mkdir(parents=True,exist_ok=True)
manifest_path=OUT/'manifest.json'
manifest=json.loads(manifest_path.read_text()) if args.actions_only else {'model':REPO,'revision':REVISION,'voice':'jf_alpha','license':'Apache-2.0','clips':[]}
tasks=[] if args.actions_only else [(f'{board}-{category}.mp3',f'ボード{spoken}。{name}。') for board,spoken in [('a','エー'),('b','ビー')] for category,name in enumerate(NAMES)]
tasks += [('call.mp3','コール。'),('raise.mp3','レイズ。'),('bet.mp3','ベット。')]
with tempfile.TemporaryDirectory(prefix='plo-voice-') as tmp:
    for filename,text in tasks:
        chunks=[r.audio.numpy() for r in pipeline(text,voice=voice,speed=1.05)]
        samples=np.concatenate(chunks)
        assert len(samples)>2400 and np.isfinite(samples).all() and np.max(np.abs(samples))>.02
        wav=Path(tmp)/'voice.wav'
        sf.write(wav,samples,24000)
        subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(wav),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar','24000','-codec:a','libmp3lame','-b:a','80k',str(OUT/filename)],check=True)
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(OUT/filename)],text=True).strip())
        manifest['clips']=[clip for clip in manifest['clips'] if clip['file']!=filename]
        manifest['clips'].append({'file':filename,'text':text,'duration':duration})
        print(filename,text,duration,flush=True)
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
