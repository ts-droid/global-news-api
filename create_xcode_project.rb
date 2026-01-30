#!/usr/bin/env ruby
require 'xcodeproj'

project_path = '/Users/thomassoderberg/.gemini/antigravity/scratch/global-news/NewsLens.xcodeproj'
project = Xcodeproj::Project.new(project_path)

# Create the main target
target = project.new_target(:application, 'NewsLens', :ios, '17.0')

# Get the main group
main_group = project.main_group

# Create GlobalNewsSwift group
swift_group = main_group.new_group('GlobalNewsSwift', 'GlobalNewsSwift')

# Add all Swift files
Dir.glob('/Users/thomassoderberg/.gemini/antigravity/scratch/global-news/GlobalNewsSwift/**/*.swift').each do |file|
  relative_path = file.sub('/Users/thomassoderberg/.gemini/antigravity/scratch/global-news/GlobalNewsSwift/', '')
  file_ref = swift_group.new_file(file)
  target.add_file_references([file_ref])
end

# Add Assets.xcassets
assets_ref = swift_group.new_file('/Users/thomassoderberg/.gemini/antigravity/scratch/global-news/GlobalNewsSwift/Assets.xcassets')
target.resources_build_phase.add_file_reference(assets_ref)

# Configure build settings
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.recomputeit.GlobalNews'
  config.build_settings['PRODUCT_NAME'] = 'NewsLens'
  config.build_settings['SWIFT_VERSION'] = '5.9'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UILaunchScreen_Generation'] = 'YES'
  config.build_settings['INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone'] = 'UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'
  config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
end

project.save

puts "✅ Project created at #{project_path}"
