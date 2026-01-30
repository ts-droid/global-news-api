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

# Sync Source Code (Generic)
rsync -av $SOURCE $TARGET

# Sync Assets specifically to the project's asset catalog structure
# The project expects assets in Global_news/Assets.xcassets
ASSETS_SOURCE="$SOURCE/Assets.xcassets/"
ASSETS_TARGET="$PROJECT_ROOT/../Test/Global_news/Global_news/Global_news/Assets.xcassets/"

echo "Syncing Assets from $ASSETS_SOURCE to $ASSETS_TARGET..."
rsync -av "$ASSETS_SOURCE" "$ASSETS_TARGET"

echo "Sync complete!"
