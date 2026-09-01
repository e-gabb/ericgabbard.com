#!/bin/zsh
# Copy the current résumé build from the job-hunt workspace into the site.
#
# The site keeps its own copy of the PDF, so regenerating the résumé over in
# job-hunt does not update what ericgabbard.com serves. This closes that gap.
# It also bumps the ?v= cache-buster on every link, because browsers hold onto
# a PDF at an unchanged URL and will keep handing back the old one.
set -e

SRC="$HOME/personal/job-hunt/Eric_Gabbard_Resume_2026.pdf"
SITE="${0:A:h}"
STAMP=$(date +%Y-%m)

[ -f "$SRC" ] || { print -u2 "no résumé at $SRC"; exit 1; }

if cmp -s "$SRC" "$SITE/resume.pdf"; then
  print "already current — nothing to do"
  exit 0
fi

cp "$SRC" "$SITE/resume.pdf"

# Rewrite every /resume.pdf link (with or without an existing ?v=) to this month.
grep -rl 'resume\.pdf' "$SITE"/*.html "$SITE"/projects/*.html 2>/dev/null | while read -r f; do
  sed -i '' -E "s|href=\"/resume\.pdf(\?v=[0-9-]+)?\"|href=\"/resume.pdf?v=$STAMP\"|g" "$f"
done

print "updated resume.pdf and stamped links ?v=$STAMP"
print "review with: git diff --stat"
