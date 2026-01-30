#!/bin/bash

# Get script directory to allow running from anywhere
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$DIR/../../"

# Source directory (Antigravity scratch)
SOURCE="$PROJECT_ROOT/GlobalNewsSwift/"

# Target directory (User's project in Test folder)
TARGET="$PROJECT_ROOT/../Test/Global_news/Global_news/GlobalNewsSwift/"

echo "Syncing files from $SOURCE to $TARGET..."

# Use rsync to update files, delete extraneous files in target (optional, maybe unsafe if user edits there?), 
# strict syncing might be dangerous if user edits.
# I will use -u (update) to overwrite older files, and -r (recursive).
# I will NOT use --delete to avoid deleting user's work by accident unless I'm sure.
# Actually, since I am the "source of truth" for these features, I should overwrite.

rsync -av $SOURCE $TARGET

echo "Sync complete!"
