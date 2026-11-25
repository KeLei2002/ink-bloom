这个文件夹是留给录音的。现在游戏里所有声音都由 js/audio.js 实时合成，这里没有音频文件。
This folder is for recorded audio. At the moment every sound is synthesised by js/audio.js and
there are no audio files here.

换成自己的声音 / To use your own audio
1. 把文件放进这个文件夹（mp3、ogg、wav、m4a 都可以）。
   Put the files in this folder (mp3, ogg, wav or m4a).
2. 打开 js/config.js，找到 MR.AUDIO_FILES，把路径写进去，例如：
   Open js/config.js, find MR.AUDIO_FILES and write the paths in, for example:

     MR.AUDIO_FILES = {
       music: { calm: 'assets/audio/music-calm.mp3', flow: '', boss: 'assets/audio/music-boss.mp3', ending: '' },
       sfx: { pop: 'assets/audio/pop.ogg', fail: 'assets/audio/fail.ogg' },
     };

   留空的项目继续用合成的声音。Entries left empty keep the synthesised sound.

音乐 / Music moods
  calm     标题页和第一幅画 / title screen and the first painting（循环 / loops）
  flow     第二、第三幅画 / second and third painting（循环 / loops）
  boss     蠹王 / the Bookworm King（循环 / loops）
  ending   结局画面 / the ending screen（只放一遍 / plays once）

音效的名字 / Sound effect names
  blot bloom step dash dashReady dashNotReady hit pop chomp arrive bite milestone clear finale stamp
  hover click start card clang crack mothWarn moth light warn tick fail
  kingRoar kingWarn kingCharge kingDazed kingHurt kingDie
  （每个名字是什么声音，见 js/audio.js 里的 SFX 表 / what each one is: see the SFX table in js/audio.js）

改完运行 node tools/check.mjs，它会检查写进去的文件都在。
Afterwards run node tools/check.mjs: it checks that every listed file exists.
