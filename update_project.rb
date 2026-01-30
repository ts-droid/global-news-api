require 'xcodeproj'

# Updated path based on analysis
project_path = '../Test/Global_news/Global_news/Global_news.xcodeproj'

puts "Attempting to open #{project_path}..."

begin
  project = Xcodeproj::Project.open(project_path)
  puts "Successfully opened project!"
  
  main_group = project.main_group
  
  global_news_group = main_group.children.find { |c| c.display_name == 'Global_news' }
  if global_news_group
    puts "Inspecting Global_news group:"
    puts "  Class: #{global_news_group.class}"
    puts "  Path: #{global_news_group.path}"
    # Valid for sync groups?
    # puts "  Real Path: #{global_news_group.real_path}" rescue puts "  No real path"
    
    # List children if possible (Sync groups might not show children in xcodeproj gem yet?)
    puts "  Children:"
    global_news_group.children.each do |child|
      puts "    - #{child.display_name}"
    end
  end
  
rescue => e
  puts "Failed to open project: #{e.message}"
end
