#!/usr/bin/env python3
"""The Tusche pixel symbols as 7x7 bitmaps ('#' on, '.' off), one per Nerd Font
codepoint the shell, Tusche Bar and Island use.

    python3 -I build_glyphs.py ../scan/core-named.json glyphs.json

Families (batteries, wifi, volume, weather, the "off" variants) come from one
template each; everything else is drawn here. Some shapes follow YAMI's MIT
7x7 set (check, close, arrows, send, gear, folder, trash, power, bolt, leaf,
gauge, lock, mic, copy, image, magnify): YAMI contributors, MIT licence.
"""
import json
import sys


def g(s):
    rows = s.split()
    assert len(rows) == 7 and all(len(r) == 7 and set(r) <= {'#', '.'} for r in rows), s
    return rows


def over(base, *cells, off=()):
    rows = [list(r) for r in base]
    for r, c in cells:
        rows[r][c] = '#'
    for r, c in off:
        rows[r][c] = '.'
    return [''.join(r) for r in rows]


def slash(base):
    """An "off" variant: a diagonal stroke with a clear gap beside it."""
    cells = [(i, i) for i in range(7)]
    gap = [(i, i + 1) for i in range(6)]
    return over(base, *cells, off=gap)


# ---------------------------------------------------------------- primitives
CHECK = g('....... ......# .....## #...##. ##.##.. .###... ..#....')
CHECK_BOLD = g('....... .....## ....### ##.###. #####.. .###... ..#....')
CHECK_ALL = g('....... ......# ..#..## #.#.##. ###.#.. .#..... .......')
CLOSE = g('#.....# .#...#. ..#.#.. ...#... ..#.#.. .#...#. #.....#')
PLUS = g('...#... ...#... ...#... ####### ...#... ...#... ...#...')
UP = g('...#... ..###.. .#.#.#. #..#..# ...#... ...#... ...#...')
DOWN = g('...#... ...#... ...#... #..#..# .#.#.#. ..###.. ...#...')
LEFT = g('...#... ..#.... .#..... ####### .#..... ..#.... ...#...')
RIGHT = g('...#... ....#.. .....#. ####### .....#. ....#.. ...#...')
CHEV_L = g('....##. ...##.. ..##... .##.... ..##... ...##.. ....##.')
CHEV_R = g('.##.... ..##... ...##.. ....##. ...##.. ..##... .##....')
CHEV_D = g('....... #.....# ##...## .##.##. ..###.. ...#... .......')

PLAY = g('..#.... ..##... ..###.. ..####. ..###.. ..##... ..#....')
PAUSE = g('....... .##.##. .##.##. .##.##. .##.##. .##.##. .......')
STOP = g('....... .#####. .#####. .#####. .#####. .#####. .......')
NEXT = g('....... .#...#. .##..#. .###.#. .##..#. .#...#. .......')
PREV = g('....... .#...#. .#..##. .#.###. .#..##. .#...#. .......')
DISC = g('....... ..###.. .#####. .#####. .#####. ..###.. .......')
RING = g('..###.. .#...#. #.....# #.....# #.....# .#...#. ..###..')
RING_DOT = g('..###.. .#...#. #.###.# #.###.# #.###.# .#...#. ..###..')
CANCEL = g('..###.. .##..#. #.#...# #..#..# #...#.# .#..##. ..###..')
CLOSE_CIRCLE = g('..###.. .#####. ##.#.## ###.### ##.#.## .#####. ..###..')
RING_CHECK = g('..###.. .#...#. #....## #.#.#.# #..#..# .#...#. ..###..')
SQUARE = g('....... .#####. ####### ####### ####### .#####. .......')
BOX = g('####### #.....# #.....# #.....# #.....# #.....# #######')
BOX_CHECK = g('####### ####### #####.# #.##.## ##..### ###.### #######')
INFO = g('..###.. .##.##. ####### ###.### ###.### .##.##. ..###..')
INFO_O = g('..###.. .#.#.#. #.....# #..#..# #..#..# .#.#.#. ..###..')
ALERT = g('...#... ..###.. ..#.#.. .##.##. .#####. ###.### #######')
TRIANGLE = g('...#... ..###.. ..###.. .#####. .#####. ####### #######')

BELL = g('...#... ..###.. .#####. .#####. .#####. ####### ...#...')
BELL_O = g('...#... ..#.#.. .#...#. .#...#. .#...#. ####### ...#...')
BELL_SLEEP = g('...#... ..#.#.. .#...#. .#####. .#...#. ####### ...#...')
# a filled bell cut by the stroke: slash() over the outline bell ran together
BELL_OFF = g('#..#... ..###.. .#.###. .##.##. .###.#. #####.# ...#..#')

CLOCK = g('..###.. .#.#.#. #..#..# #..##.# #.....# .#...#. ..###..')
ALARM = g('##...## #.###.# .#.#.#. .#.###. .#...#. ..###.. .#...#.')
TIMER = g('..###.. ...#... ..###.. .##.##. .##.##. .#####. ..###..')
TIMER_O = g('..###.. ...#... ..###.. .#.#.#. .#.#.#. .#...#. ..###..')
HOURGLASS = g('####### .#...#. ..#.#.. ...#... ..#.#.. .#.#.#. #######')
PROGRESS_CLOCK = g('..#.#.. .#.#... #..#..# ...##.# #.....# .#...#. ..###..')

CAL = g('#.#.#.# ####### #.....# #.#.#.# #.....# #.#.#.# #######')
CAL_BLANK = g('#.#.#.# ####### #.....# #.....# #.....# #.....# #######')
CAMERA = g('....... .###... ####### ##...## #..#..# ##...## #######')
VIDEO = g('....... ####..# ####.## ####### ####.## ####..# .......')
MUSIC = g('..##### ..#...# ..#...# ..#...# .##..## ###.### .#...#.')
NOTE = g('...#... ...##.. ...#.#. ...#... .###... ####... .##....')
MIC = g('..###.. ..###.. ..###.. #.###.# .#####. ...#... ..###..')
HEADPHONES = g('..###.. .#...#. #.....# #.....# ##...## ##...## ##...##')
SPEAKER_BOX = g('.#####. .##.##. .#####. .#...#. .#.#.#. .#...#. .#####.')

CELLPHONE = g('.#####. .#...#. .#...#. .#...#. .#...#. .#####. .##.##.')
PHONE = g('##..... ###.... .#..... .##.... ..##... ...#### ....###')
WHATSAPP = g('..###.. .#...#. #.##..# #.#...# #..##.# .#...#. #.###..')
BLUETOOTH = g('...#... ...##.. .#.#.#. ..###.. .#.#.#. ...##.. ...#...')

FILE = g('#####.. #...##. #....#. #....#. #....#. #....#. ######.')
FILE_DOC = g('#####.. #...##. #....#. #.##.#. #....#. #.##.#. ######.')
FILE_VIDEO = g('#####.. #...##. #.#..#. #.##.#. #.#..#. #....#. ######.')
IMAGE = g('####### #.....# #.#...# #...#.# #..#### #.##### #######')
FOLDER = g('###.... #..#### #.....# #.....# #.....# ####### .......')
MAGNIFY = g('.###... #...#.. #...#.. #...#.. .####.. ....##. .....##')
MONITOR = g('####### #.....# #.....# #.....# ####### ...#... .#####.')
MONITORS = g('..##### ..#...# ####..# #..#### #..#... ####... .##....')
DESKTOP = g('.#####. .#...#. .#...#. .#####. ....... ####### #.#.#.#')
LAPTOP = g('.#####. .#...#. .#...#. .#...#. .#####. ####### .......')
SEND = g('#...... ###.... #####.. ####### #####.. ###.... #......')

# antenna, ears, two eyes and a mouth: a filled head read as a blob at bar size
ROBOT = g('...#... ...#... .#####. ##.#.## .#####. .#...#. .#####.')
ROBOT_EXCITED = g('...#... ...#... .#####. ##.#.## .#####. .#.#.#. .#####.')
SHIELD_ALERT = g('####### ###.### ###.### .#####. .##.##. ..###.. ...#...')
SHIELD = g('####### #.....# #.....# .#...#. .#...#. ..#.#.. ...#...')
SHIELD_LOCK = g('####### ###.### ##...## .##.##. .##.##. ..###.. ...#...')
LOCK = g('..###.. .#...#. .#...#. ####### ###.### ###.### #######')
KEY = g('....... ....... .##.... #..#### #..#.#. .##.... .......')
FINGERPRINT = g('..###.. .#...#. #..#..# #.#.#.# #.#.#.# #.#.#.# ..#.#..')
VPN = g('..###.. .#...#. ####### ##.#.## ##.#.## ####### .......')

EYE = g('....... ..###.. .#...#. #..#..# .#...#. ..###.. .......')
# the slash() template crowds the pupil; a stroke the other way, clear of it
EYE_OFF = g('......# ..###.. .#..##. #..#..# .##..#. ..###.. #......')
DOTS_V = g('...#... ....... ....... ...#... ....... ....... ...#...')
DOTS_H = g('....... ....... ....... #..#..# ....... ....... .......')
DOWNLOAD = g('...#... ...#... #..#..# .#.#.#. ..###.. ....... #######')
EXPORT = g('...#... ..###.. .#.#.#. ...#... #..#..# #.....# #######')
HAPPY = g('..###.. .#...#. #.#.#.# #.....# #.#.#.# .#.#.#. ..###..')
FROWN = g('..###.. .#...#. #.#.#.# #.....# #..#..# .##.##. ..###..')
LINK = g('....... ....... .##.##. #..#..# .##.##. ....... .......')
OPEN_NEW = g('##..### #....## #...#.# #..#..# #.....# #.....# #######')
GAUGE = g('....... ..###.. .#...#. #..#..# #.#...# #.....# #######')
BOLT = g('....##. ...##.. ..##... .#####. ...##.. ..##... .##....')
BUBBLE_BADGE = g('####..# #...#.. #.....# #.....# ####### .#..... #......')
BUBBLE_TEXT = g('####### #.....# #.###.# #.....# ####### .##.... #......')
BUBBLE_PLUS = g('####### #..#..# #.###.# #..#..# ####### .##.... #......')
LETTER_A = g('..###.. .#...#. #.....# ####### #.....# #.....# #.....#')
BRACES = g('.##.##. .#...#. .#...#. ##...## .#...#. .#...#. .##.##.')
GLOBE = g('..###.. .#.#.#. #..#..# ####### #..#..# .#.#.#. ..###..')
MUG = g('.#..#.. #..#... ....... ######. #####.# ######. .####..')
HEART = g('....... .##.##. ####### ####### .#####. ..###.. ...#...')
STAR = g('...#... ...#... ####### .#####. ..###.. .##.##. ##...##')
BOOK = g('.##.##. #..#..# #..#..# #..#..# #..#..# .##.##. ...#...')
NOTEBOOK = g('######. #.#..#. #.#..#. #.#..#. #.#..#. #.#..#. ######.')
MARKER = g('..###.. .#####. ###.### .#####. ..###.. ...#... ...#...')
PIN = g('..###.. .#####. .#####. ..###.. ...#... ...#... ...#...')
PIN_O = g('..###.. .#...#. .#...#. ..###.. ...#... ...#... ...#...')
TUX = g('..###.. .#.#.#. .##.##. #.....# #.....# #.....# ##...##')
PERSON = g('..###.. .#...#. ..###.. ....... .#####. #.....# #######')
PEOPLE = g('.##.##. #..#..# .##.##. ....... ####### #..#..# #######')
ANDROID = g('.#...#. ..###.. .#.#.#. .#####. ....... .#####. .#####.')
APPLE = g('....#.. ...#... .##.##. ####### ######. ####### .##.##.')
APPS = g('#..#..# ....... ....... #..#..# ....... ....... #..#..#')
EXPAND = g('##...## #.....# ....... ....... ....... #.....# ##...##')
FULLSCREEN = g('###.### #.....# #.....# ....... #.....# #.....# ###.###')
FULLSCREEN_EXIT = g('.#...#. ##...## ....... ....... ....... ##...## .#...#.')
HAMBURGER = g('....... ####### ....... ####### ....... ####### .......')
BUG = g('.#...#. ..###.. ##.#.## .#####. ##.#.## .#####. ..###..')
COPY = g('####... #..#... #.####. #.#..#. ###..#. ..#..#. ..####.')
CLIPBOARD = g('..###.. ###.### #.....# #.###.# #.....# #.###.# #######')
CROSSHAIRS = g('..###.. .#.#.#. #.....# ###.### #.....# .#.#.#. ..###..')
TRASH = g('..###.. ####### .#.#.#. .#.#.#. .#.#.#. .#.#.#. ..###..')
EMAIL = g('####### ##...## #.#.#.# #..#..# #.....# #.....# #######')
ETHERNET = g('....... .#####. .#...#. ##...## #.#.#.# #.#.#.# #######')
CONTROLLER = g('....... .#####. ##.###. #...#.# ##.###. ####### ##...##')
DRIVE = g('...#... ..#.#.. ..#.#.. .#...#. .#...#. #.....# #######')
HARDDISK = g('....... ####### #.....# #.....# ####### #...#.# #######')
LEAF = g('....### ..##### .###..# .##..## #.#.##. #..##.. #......')
LOGOUT = g('###.... #...... #....#. #.##### #....#. #...... ###....')
WINDOWS = g('###.### ###.### ###.### ....... ###.### ###.### ###.###')
MOUSE = g('..###.. .#.#.#. .#.#.#. .#####. .#...#. .#...#. ..###..')
PACKAGE = g('.#####. ####### #..#..# #..#..# #..#..# #..#..# #######')
PALETTE = g('.#####. #.#.#.# #.....# ##...## #...#.# .#.###. ..#....')
PAPERCLIP = g('..###.. .#...#. .#.#.#. .#.#.#. .#.#.#. .#...#. ..###..')
PENCIL = g('.....## ....### ...###. ..###.. .###... ##..... #......')
PUZZLE = g('....... ..##... #####.. ####### #####.. ..##... .......')
POWER = g('...#... .#.#.#. #..#..# #.....# #.....# .#...#. ..###..')
QR = g('###.### #.#.#.# ###.### ....... ###.#.# #.#..#. ###.###')
REFRESH = g('..###.# .#...## #...### #...... #.....# .#...#. ..###..')
RESTART = g('#.###.. ##...#. ###...# ......# #.....# .#...#. ..###..')
SYNC = g('..###.. .#...## #....## ....... ##....# ##...#. ..###..')
UPDATE = g('..###.# .#...## #..#### #..#... #.....# .#...#. ..###..')
REPLY = g('..#.... .##.... #####.. .##..#. ..#...# ......# .......')
RUN = g('...##.. ...##.. .####.. #.###.# ..##... .#..#.. #....#.')
GEAR = g('#.###.# .#####. ##...## ##...## ##...## .#####. #.###.#')
HALF = g('..###.. .#.###. #..#### #..#### #..#### .#.###. ..###..')
DASHBOARD = g('###.### ###.### ###.... ###.### ....### ###.### ###.###')
WATCH = g('.#####. .#####. #.....# #..##.# #.....# .#####. .#####.')
CHIP = g('.#.#.#. .#####. ##...## .#...#. ##...## .#####. .#.#.#.')
CONSOLE = g('####### #.....# #.#...# #..#..# #.#.### #.....# #######')
PASSWORD = g('....... ####### #.....# #.#.#.# #.....# ####### .......')
FLOPPY = g('######. #...#.# #...#.# #.....# #.###.# #.###.# #######')
HDMI = g('....... ####### #.....# #.....# .#...#. ..###.. .......')
APPLICATION = g('####### ####### #.....# #.....# #.....# #.....# #######')
KEYBOARD = g('....... ####### #.#.#.# ##.#.## #.###.# ####### .......')
TRACKPAD = g('####### #.....# #.....# #.....# ###.### #..#..# #######')
TAP = g('..#.#.. ...#... ...#... ...###. ..####. .#####. .#####.')
SIGNATURE = g('....... .#..... #.#..#. ...##.# ....... ####### .......')
ROUTER = g('#.....# .#...#. ....... ####### #.#.#.# ####### .......')
ROCKET = g('....### ...#### ..####. #.###.. ##.#... .#..... #.#....')
DROPBOX = g('.#...#. ###.### .#...#. .#...#. ###.### .#...#. ...#...')

SUN = g('...#... .#...#. ..###.. #.###.# ..###.. .#...#. ...#...')
SUN_HOLLOW = g('...#... .#...#. ..###.. #.#.#.# ..###.. .#...#. ...#...')
SUN_SMALL = g('...#... ....... ..###.. #.###.# ..###.. ....... ...#...')
MOON = g('..###.. .##.... ##..... ##..... ##..... .##.... ..###..')
CLOUD = g('....... ....... ...##.. .##..#. #.....# #.....# .#####.')
CLOUD_TOP = g('..##... .#..##. #.....# .#####. ....... ....... .......')
FOG = g('....... ####### ....... .#####. ....... ####### .......')


def cloudy(marker):
    base = CLOUD
    if marker == 'day':
        return over(base, (0, 0), (0, 2), (1, 1))
    if marker == 'night':
        return over(base, (0, 1), (1, 0), (2, 1))
    return base


RAIN = over(CLOUD_TOP, (5, 2), (5, 5), (6, 1), (6, 4))
SNOW = over(CLOUD_TOP, (5, 1), (5, 5), (6, 3))
SLEET = over(CLOUD_TOP, (5, 1), (5, 4), (6, 3), (6, 6))
THUNDER = over(CLOUD_TOP, (4, 3), (5, 2), (5, 3), (6, 3))


# ---------------------------------------------------------------- families
SPEAKER = g('..#.... .##.... ###.... ###.... ###.... .##.... ..#....')
WAVE1 = [(2, 4), (3, 4), (4, 4)]
VOL_LOW = over(SPEAKER, *WAVE1)
VOL_MED = over(SPEAKER, *WAVE1, (2, 6), (3, 6), (4, 6))
VOL_HIGH = over(SPEAKER, *WAVE1, (1, 6), (2, 6), (3, 6), (4, 6), (5, 6))
VOL_MUTE = over(SPEAKER, (2, 4), (2, 6), (3, 5), (4, 4), (4, 6))


def battery(level, charging=False):
    rows = [list('.......'), list('######.'), list('#....##'), list('#....##'), list('#....##'),
            list('######.'), list('.......')]
    cols = 0 if level is None else max(1, -(-level // 25)) if level > 0 else 0
    for r in (2, 3, 4):
        for c in range(1, 1 + cols):
            rows[r][c] = '#'
    if charging:
        for r, c in ((2, 3), (3, 2), (3, 3), (4, 2)):
            rows[r][c] = '.' if rows[r][c] == '#' else '#'
    return [''.join(r) for r in rows]


WIFI_A = [(1, c) for c in range(1, 6)] + [(2, 0), (2, 6)]
WIFI_B = [(3, 2), (3, 3), (3, 4), (4, 1), (4, 5)]
WIFI_C = [(6, 3)]
# an arc not reached, dotted: the whole fan stays readable at every strength
WIFI_A_DOT = [(1, 1), (1, 3), (1, 5), (2, 0), (2, 6)]
WIFI_B_DOT = [(3, 3), (4, 1), (4, 5)]
WIFI_A_INNER = [(1, c) for c in range(1, 6)]
EMPTY = ['.......'] * 7


def wifi(*parts):
    cells = [c for p in parts for c in p]
    return over(EMPTY, *cells)


WIFI_FULL = wifi(WIFI_A, WIFI_B, WIFI_C)

BY_NAME = {
    'cod-globe': GLOBE, 'md-earth': GLOBE,
    'dev-cobol': BRACES, 'seti-font': LETTER_A, 'fa-language': LETTER_A,
    'dev-dropbox': DROPBOX,
    'fa-book': BOOK, 'md-notebook': NOTEBOOK,
    'fa-check': CHECK, 'md-check': CHECK, 'md-check_bold': CHECK_BOLD, 'md-check_all': CHECK_ALL,
    'fa-chevron_left': CHEV_L, 'md-chevron_left': CHEV_L, 'fa-chevron_right': CHEV_R,
    'md-chevron_right': CHEV_R, 'md-chevron_down': CHEV_D,
    'fa-clock_o': CLOCK, 'md-clock_outline': CLOCK, 'md-alarm': ALARM, 'md-reminder': ALARM,
    'md-timer': TIMER, 'md-timer_outline': TIMER_O, 'md-timer_sand': HOURGLASS,
    'md-progress_clock': PROGRESS_CLOCK, 'md-watch': WATCH,
    'fa-eye': EYE, 'md-eye_outline': EYE, 'md-eye_off': EYE_OFF,
    'fa-flash': BOLT, 'md-lightning_bolt': BOLT,
    'fa-heart': HEART, 'fa-star': STAR, 'md-star': STAR,
    'fa-linux': TUX, 'md-linux': TUX,
    'fa-lock': LOCK, 'md-lock': LOCK,
    'fa-map_marker': MARKER, 'md-map_marker': MARKER,
    'fa-mug_hot': MUG,
    'fa-refresh': REFRESH, 'md-refresh': REFRESH, 'md-reload': REFRESH, 'md-restart': RESTART,
    'md-sync': SYNC, 'md-update': UPDATE,
    'fa-thumbtack': PIN, 'md-pin': PIN, 'md-pin_outline': PIN_O, 'md-pin_off_outline': slash(PIN_O),
    'fa-volume_low': VOL_LOW, 'md-volume_low': VOL_LOW, 'md-volume_medium': VOL_MED,
    'fa-volume_up': VOL_HIGH, 'md-volume_high': VOL_HIGH, 'fa-volume_off': SPEAKER,
    'fa-volume_xmark': VOL_MUTE, 'md-volume_mute': VOL_MUTE, 'md-speaker': SPEAKER_BOX,
    'md-account_group': PEOPLE, 'md-account_multiple_outline': PEOPLE, 'md-account_outline': PERSON,
    'md-alert': ALERT, 'md-triangle': TRIANGLE,
    'md-android': ANDROID, 'md-apple': APPLE, 'md-microsoft': WINDOWS,
    'md-application': APPLICATION, 'md-apps': APPS,
    'md-arrow_down': DOWN, 'md-arrow_left': LEFT, 'md-arrow_right': RIGHT,
    'md-arrow_expand_all': EXPAND, 'md-fullscreen': FULLSCREEN, 'md-fullscreen_exit': FULLSCREEN_EXIT,
    'md-backburger': HAMBURGER, 'md-forwardburger': HAMBURGER,
    'md-bell': BELL, 'md-bell_outline': BELL_O, 'md-bell_off': BELL_OFF,
    'md-bell_off_outline': BELL_OFF, 'md-bell_sleep': BELL_SLEEP,
    'md-bluetooth': BLUETOOTH, 'md-bluetooth_connect': over(BLUETOOTH, (3, 0), (3, 6)),
    'md-bluetooth_off': slash(BLUETOOTH),
    'md-brightness_5': SUN_SMALL, 'md-brightness_6': SUN_HOLLOW, 'md-brightness_7': SUN,
    'md-bug': BUG, 'md-calendar': CAL, 'md-calendar_blank': CAL_BLANK,
    'md-camera': CAMERA, 'md-video': VIDEO, 'md-file_video': FILE_VIDEO,
    'md-cancel': CANCEL, 'md-circle': DISC, 'md-record': DISC, 'md-record_circle': RING_DOT,
    'md-checkbox_blank_circle_outline': RING, 'md-checkbox_marked_circle_outline': RING_CHECK,
    'md-checkbox_blank_outline': BOX, 'md-checkbox_marked': BOX_CHECK,
    'md-close': CLOSE, 'md-close_circle': CLOSE_CIRCLE, 'md-square_rounded': SQUARE,
    'md-cellphone': CELLPHONE, 'md-phone': PHONE, 'md-phone_outline': PHONE,
    'md-chat_plus_outline': BUBBLE_PLUS, 'md-message_text': BUBBLE_TEXT,
    'md-message_text_outline': BUBBLE_TEXT, 'md-message_badge_outline': BUBBLE_BADGE,
    'md-chip': CHIP, 'md-clipboard_outline': CLIPBOARD, 'md-content_paste': CLIPBOARD,
    'md-content_copy': COPY, 'md-content_save_outline': FLOPPY,
    'md-cog': GEAR, 'md-cog_outline': GEAR, 'md-console_line': CONSOLE,
    'md-crosshairs': CROSSHAIRS, 'md-delete': TRASH,
    'md-desktop_classic': DESKTOP, 'md-monitor': MONITOR, 'md-monitor_multiple': MONITORS,
    'md-remote_desktop': MONITOR, 'md-laptop': LAPTOP,
    'md-dots_horizontal': DOTS_H, 'md-dots_vertical': DOTS_V,
    'md-download': DOWNLOAD, 'md-export': EXPORT, 'md-open_in_new': OPEN_NEW,
    'md-email': EMAIL,
    'md-emoticon_happy_outline': HAPPY, 'md-sticker_emoji': HAPPY, 'md-emoticon_frown': FROWN,
    'md-ethernet': ETHERNET, 'md-ethernet_cable_off': slash(ETHERNET),
    'md-file': FILE, 'md-file_document': FILE_DOC, 'md-file_gif_box': IMAGE,
    'md-fingerprint': FINGERPRINT, 'md-fingerprint_off': slash(FINGERPRINT),
    'md-folder_image': FOLDER, 'md-image': IMAGE, 'md-image_area': IMAGE, 'md-image_outline': IMAGE,
    'md-form_textbox_password': PASSWORD,
    'md-gauge': GAUGE, 'md-speedometer': GAUGE,
    'md-gesture_tap': TAP, 'md-google_controller': CONTROLLER, 'md-google_drive': DRIVE,
    'md-harddisk': HARDDISK, 'md-headphones': HEADPHONES,
    'md-information': INFO, 'md-information_outline': INFO_O,
    'md-key': KEY, 'md-key_variant': KEY, 'md-vpn': VPN,
    'md-keyboard': KEYBOARD, 'md-keyboard_outline': KEYBOARD, 'md-trackpad': TRACKPAD,
    'md-leaf': LEAF, 'md-link': LINK, 'md-link_variant': LINK, 'md-logout': LOGOUT,
    'md-magnify': MAGNIFY, 'md-microphone': MIC, 'md-microphone_off': slash(MIC),
    'md-mouse': MOUSE, 'md-music': MUSIC, 'md-music_circle': NOTE, 'md-music_note_2': NOTE,
    'md-package_variant_closed': PACKAGE, 'md-palette': PALETTE, 'md-paperclip': PAPERCLIP,
    'md-pause': PAUSE, 'md-play': PLAY, 'md-stop': STOP, 'md-skip_next': NEXT, 'md-skip_previous': PREV,
    'md-pencil': PENCIL, 'md-plus': PLUS, 'md-power': POWER, 'md-puzzle': PUZZLE, 'md-qrcode': QR,
    'md-reply': REPLY, 'md-robot': ROBOT, 'md-robot_excited': ROBOT_EXCITED,
    'md-rocket_launch': ROCKET, 'md-router': ROUTER, 'md-run': RUN,
    'md-security': SHIELD, 'md-shield_alert': SHIELD_ALERT, 'md-shield_lock': SHIELD_LOCK,
    'md-send': SEND, 'md-signature_freehand': SIGNATURE, 'md-theme_light_dark': HALF,
    'md-video_input_hdmi': HDMI, 'md-view_dashboard': DASHBOARD, 'md-view_grid': WINDOWS,
    'md-whatsapp': WHATSAPP,
    'md-wifi': WIFI_FULL, 'md-wifi_strength_4': WIFI_FULL, 'md-wifi_off': slash(WIFI_FULL),
    'md-wifi_strength_3': wifi(WIFI_A_INNER, WIFI_B, WIFI_C),
    'md-wifi_strength_2': wifi(WIFI_A_DOT, WIFI_B, WIFI_C),
    'md-wifi_strength_1': wifi(WIFI_A_DOT, WIFI_B_DOT, WIFI_C),
    'md-wifi_strength_outline': wifi(WIFI_A_DOT, WIFI_B_DOT),
    'md-wifi_strength_off_outline': slash(wifi(WIFI_A_DOT, WIFI_B_DOT)),
    'md-wifi_strength_4_alert': over(WIFI_FULL, (4, 3), off=[(3, 3)]),
    'md-battery': battery(100), 'md-battery_outline': battery(0),
    'md-battery_charging': battery(100, True), 'md-battery_charging_outline': battery(0, True),
    'weather-day_sunny': SUN, 'weather-night_clear': MOON,
    'weather-cloud': cloudy(None), 'weather-day_cloudy': cloudy('day'), 'weather-night_cloudy': cloudy('night'),
    'weather-rain': RAIN, 'weather-day_rain': RAIN, 'weather-night_rain': RAIN, 'md-weather_rainy': RAIN,
    'weather-snow': SNOW, 'weather-day_snow': SNOW, 'weather-night_alt_snow': SNOW,
    'weather-sleet': SLEET, 'weather-thunderstorm': THUNDER,
    'weather-fog': FOG, 'weather-night_fog': FOG,
}
for level in range(10, 101, 10):
    BY_NAME[f'md-battery_{level}'] = battery(level)
    BY_NAME[f'md-battery_charging_{level}'] = battery(level, True)


def main(src, out):
    entries = json.load(open(src))
    result, missing = {}, []
    for e in entries:
        cp = e['cp'][2:].lower()
        rows = BY_NAME.get(e['name'])
        if rows is None:
            missing.append(e['name'])
            continue
        result[cp] = {'name': e['name'], 'rows': rows}
    if missing:
        raise SystemExit('no bitmap for: ' + ', '.join(missing))
    json.dump(result, open(out, 'w'), indent=1, sort_keys=True)
    print(json.dumps({'glyphs': len(result)}))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
