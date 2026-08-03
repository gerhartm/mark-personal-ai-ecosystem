from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


CLIENT_ROOT = Path(__file__).resolve().parents[3]
OUT = CLIENT_ROOT / "01-Source-Material" / "access-guides" / "Hetzner_VPS_Read_Only_Access_Guide.docx"

NAVY = "17365D"
BLUE = "2E74B5"
INK = "202733"
MUTED = "5B6573"
LIGHT_GREEN = "EAF6EF"
GREEN = "23633A"
LIGHT_GOLD = "FFF7DF"
GOLD = "7A5A00"
LIGHT_GRAY = "F3F5F7"


def set_font(run, name="Calibri", size=10.5, color=INK, bold=False, italic=False):
    run.font.name = name
    r_fonts = run._element.get_or_add_rPr().rFonts
    r_fonts.set(qn("w:ascii"), name)
    r_fonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    run.bold = bold
    run.italic = italic


def set_para(p, before=0, after=5, line=1.12, keep_next=False):
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = line
    p.paragraph_format.keep_with_next = keep_next


def add_text(doc, text, *, bold_prefix=None, after=5, color=INK, keep_next=False):
    p = doc.add_paragraph()
    set_para(p, after=after, keep_next=keep_next)
    if bold_prefix and text.startswith(bold_prefix):
        r = p.add_run(bold_prefix)
        set_font(r, bold=True, color=color)
        r = p.add_run(text[len(bold_prefix):])
        set_font(r, color=color)
    else:
        r = p.add_run(text)
        set_font(r, color=color)
    return p


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    p.add_run(text)
    return p


def add_callout(doc, label, text, *, fill=LIGHT_GREEN, accent=GREEN):
    p = doc.add_paragraph()
    set_para(p, before=3, after=7, line=1.12)
    p.paragraph_format.left_indent = Inches(0.10)
    p.paragraph_format.right_indent = Inches(0.06)
    p_pr = p._p.get_or_add_pPr()

    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    p_pr.append(shd)

    borders = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "18")
    left.set(qn("w:space"), "6")
    left.set(qn("w:color"), accent)
    borders.append(left)
    p_pr.append(borders)

    r = p.add_run(f"{label}: ")
    set_font(r, bold=True, color=accent)
    r = p.add_run(text)
    set_font(r)
    return p


def add_code(doc, lines):
    for index, line in enumerate(lines):
        p = doc.add_paragraph()
        set_para(p, after=0 if index < len(lines) - 1 else 5, line=1.0, keep_next=index < len(lines) - 1)
        p.paragraph_format.left_indent = Inches(0.12)
        p.paragraph_format.right_indent = Inches(0.04)
        p_pr = p._p.get_or_add_pPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:fill"), LIGHT_GRAY)
        p_pr.append(shd)
        r = p.add_run(line if line else " ")
        set_font(r, name="Courier New", size=8.0, color="20242A")


def create_numbering(doc, fmt, marker, left=540, hanging=270):
    numbering = doc.part.numbering_part.element
    abstract_ids = [int(x.get(qn("w:abstractNumId"))) for x in numbering.findall(qn("w:abstractNum"))]
    abstract_id = max(abstract_ids, default=-1) + 1

    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(abstract_id))
    multi = OxmlElement("w:multiLevelType")
    multi.set(qn("w:val"), "singleLevel")
    abstract.append(multi)

    level = OxmlElement("w:lvl")
    level.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:start")
    start.set(qn("w:val"), "1")
    level.append(start)
    num_fmt = OxmlElement("w:numFmt")
    num_fmt.set(qn("w:val"), fmt)
    level.append(num_fmt)
    level_text = OxmlElement("w:lvlText")
    level_text.set(qn("w:val"), marker)
    level.append(level_text)
    suffix = OxmlElement("w:suff")
    suffix.set(qn("w:val"), "tab")
    level.append(suffix)

    p_pr = OxmlElement("w:pPr")
    tabs = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "num")
    tab.set(qn("w:pos"), str(left))
    tabs.append(tab)
    p_pr.append(tabs)
    indent = OxmlElement("w:ind")
    indent.set(qn("w:left"), str(left))
    indent.set(qn("w:hanging"), str(hanging))
    p_pr.append(indent)
    level.append(p_pr)
    abstract.append(level)
    numbering.append(abstract)

    num_ids = [int(x.get(qn("w:numId"))) for x in numbering.findall(qn("w:num"))]
    num_id = max(num_ids, default=0) + 1
    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(num_id))
    abstract_ref = OxmlElement("w:abstractNumId")
    abstract_ref.set(qn("w:val"), str(abstract_id))
    num.append(abstract_ref)
    numbering.append(num)
    return num_id


def add_list_item(doc, text, num_id, *, after=3, keep_next=False):
    p = doc.add_paragraph()
    set_para(p, after=after, line=1.12, keep_next=keep_next)
    num_pr = OxmlElement("w:numPr")
    level = OxmlElement("w:ilvl")
    level.set(qn("w:val"), "0")
    num_ref = OxmlElement("w:numId")
    num_ref.set(qn("w:val"), str(num_id))
    num_pr.append(level)
    num_pr.append(num_ref)
    p._p.get_or_add_pPr().append(num_pr)
    r = p.add_run(text)
    set_font(r)
    return p


def add_field(paragraph, instruction):
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), instruction)
    run = OxmlElement("w:r")
    text = OxmlElement("w:t")
    text.text = "1"
    run.append(text)
    field.append(run)
    paragraph._p.append(field)


doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = Inches(0.80)
section.bottom_margin = Inches(0.72)
section.left_margin = Inches(0.88)
section.right_margin = Inches(0.88)
section.header_distance = Inches(0.34)
section.footer_distance = Inches(0.35)

normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
normal.font.size = Pt(10.5)
normal.font.color.rgb = RGBColor.from_string(INK)
normal.paragraph_format.space_before = Pt(0)
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.12

for name, size, color, before, after in (
    ("Heading 1", 15, BLUE, 11, 6),
    ("Heading 2", 12.5, NAVY, 8, 4),
    ("Heading 3", 11.5, NAVY, 6, 3),
):
    style = doc.styles[name]
    style.font.name = "Calibri"
    style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor.from_string(color)
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)
    style.paragraph_format.keep_with_next = True

header = section.header
hp = header.paragraphs[0]
set_para(hp, after=0, line=1.0)
run = hp.add_run("TEMPORARY VPS ACCESS")
set_font(run, size=8.3, color=BLUE, bold=True)
run = hp.add_run("   |   TECHNICAL REVIEW")
set_font(run, size=8.3, color=MUTED)

footer = section.footer
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
set_para(fp, after=0, line=1.0)
run = fp.add_run("Darshan  |  VPS access guide  |  Page ")
set_font(run, size=8.0, color=MUTED)
add_field(fp, "PAGE")
run = fp.add_run(" of ")
set_font(run, size=8.0, color=MUTED)
add_field(fp, "NUMPAGES")

kicker = doc.add_paragraph()
set_para(kicker, before=6, after=2, line=1.0)
run = kicker.add_run("HETZNER VPS")
set_font(run, size=8.8, color=BLUE, bold=True)

title = doc.add_paragraph()
set_para(title, after=5, line=1.0, keep_next=True)
run = title.add_run("How to Give Me\nVPS Access")
set_font(run, size=24, color=NAVY, bold=True)

add_text(
    doc,
    "Hi Mark, please use the steps below to create a temporary read-only account for me. I need to inspect the complete persistent filesystem on the VPS for the initial technical review, without sudo or write access.",
    after=7,
)

add_callout(
    doc,
    "Recommended and easiest: invite me as a Hetzner Member",
    "Open the project, go to Security > Members > Add Member, enter the Hetzner email address I send you, choose Member, and send the invitation. I will create the full-VPS read-only SSH account, then let you know when you can remove my Member access.",
)

add_heading(doc, "Before you start", 2)
bullet_id = create_numbering(doc, "bullet", "•", left=500, hanging=250)
for text in (
    "Keep your current administrator SSH session open until my new login has been tested.",
    "Ask me for one public-key line beginning with ssh-ed25519. Please never ask for or share a private key.",
    "This gives me read access to the full persistent filesystem, which may include .env files, tokens, credentials, or private keys. Contact me before continuing if that is not acceptable.",
):
    add_list_item(doc, text, bullet_id, after=2)

add_heading(doc, "Manual setup (only if preferred)", 1)
step_id = create_numbering(doc, "decimal", "%1.", left=500, hanging=250)

add_list_item(doc, "Create a temporary user for me.", step_id, keep_next=True)
add_code(doc, [
    'sudo adduser --disabled-password --gecos "" darshan-review',
    "sudo passwd -l darshan-review",
])

add_list_item(doc, "Add the public key I send you.", step_id, keep_next=True)
add_code(doc, [
    "sudo install -d -m 700 -o darshan-review -g darshan-review /home/darshan-review/.ssh",
    "sudo nano /home/darshan-review/.ssh/authorized_keys",
])
add_text(doc, "Paste this single public-key line into the file:", after=2, color=MUTED)
add_code(doc, [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIArYXRu8wGEQ6CsYY6APvi+EWM/pHs72ugW6EUOPcZoh",
])
add_text(doc, "In nano, press Ctrl+O, Enter, then Ctrl+X.", after=3, color=MUTED)
add_code(doc, [
    "sudo chown darshan-review:darshan-review /home/darshan-review/.ssh/authorized_keys",
    "sudo chmod 600 /home/darshan-review/.ssh/authorized_keys",
])

add_list_item(doc, "Define the persistent VPS locations to inspect.", step_id, keep_next=True)
add_code(doc, [
    'VPS_DIRS="/bin /boot /etc /home /lib /lib32 /lib64 /media /mnt /opt /root /sbin /srv /usr /var"',
])
add_text(doc, "These are the persistent filesystem locations. Runtime virtual filesystems such as /proc, /sys, /dev, and /run are not included.", after=3, color=MUTED)

add_list_item(doc, "Grant read/traverse access across those locations.", step_id, keep_next=True)
add_code(doc, [
    "command -v setfacl >/dev/null || sudo apt-get install -y acl",
    'sudo setfacl -m u:darshan-review:--x /',
    'for dir in $VPS_DIRS; do [ -e "$dir" ] && sudo setfacl -R -m u:darshan-review:r-X "$dir"; done',
])
add_text(doc, "This grants read/traverse permission only; it does not grant write, sudo, or service-control access.", after=4, color=MUTED)

doc.add_page_break()

add_heading(doc, "Finish and verify", 1)

add_list_item(doc, "Check that I can read the VPS but cannot write to it.", step_id, keep_next=True)
add_code(doc, [
    'sudo -u darshan-review ls -la /etc /home /opt /root /usr /var >/dev/null && echo "VPS: readable"',
    'sudo -u darshan-review find $VPS_DIRS -writable -print -quit',
    "sudo -l -U darshan-review",
])
add_text(doc, "The find command should print nothing. The sudo check should show that darshan-review cannot run sudo.", after=5, color=MUTED)

add_list_item(doc, "Send me the connection details through Upwork after the contract is active.", step_id, keep_next=True)
add_text(doc, "Please send the server IP or hostname, SSH username darshan-review, and SSH port if it is not 22.", after=6)

add_heading(doc, "What this access allows", 1)
add_text(doc, "I can inspect the current files and directories across the VPS's persistent filesystem, including service configurations, logs, project files, and other files that are readable through the ACL.", bold_prefix="I can ")
add_text(doc, "I cannot modify files, restart services, install packages, change system configuration, or use sudo.", bold_prefix="I cannot ")

add_callout(
    doc,
    "Please keep the access scoped",
    "Do not add darshan-review to sudo, root, adm, systemd-journal, Docker, or application-owner groups. The account should receive only the read/traverse ACL described above.",
    fill=LIGHT_GOLD,
    accent=GOLD,
)

add_heading(doc, "Remove the access when the review is complete", 1)
add_text(doc, "After I confirm the review is finished, run:", after=3)
add_code(doc, [
    'for dir in $VPS_DIRS; do [ -e "$dir" ] && sudo setfacl -R -x u:darshan-review "$dir"; done',
    'sudo setfacl -x u:darshan-review /',
    "sudo userdel -r darshan-review",
])

add_callout(
    doc,
    "If anything is unclear",
    "If you have any difficulty with these commands or understanding how the folders and services fit together, please stop and contact me. The recommended Member invitation at the top is the easiest option and does not require you to run the Linux commands yourself.",
)

doc.core_properties.title = "How to Give Me VPS Access"
doc.core_properties.subject = "Simple client instructions for scoped Hetzner VPS access"
doc.core_properties.author = "Darshan Ahirrao"
doc.core_properties.keywords = "Hetzner, SSH, read-only access, technical review"

OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUT)
print(OUT)
