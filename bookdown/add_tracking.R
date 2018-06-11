


files = list.files('../docs', '.html', full.names = T)

trackingLines = c(
  '<!-- Global site tag (gtag.js) - Google Analytics -->',
  '<script async src="https://www.googletagmanager.com/gtag/js?id=UA-120674089-1"></script>',
  '<script>',
  'window.dataLayer = window.dataLayer || [];',
  'function gtag(){dataLayer.push(arguments);}',
  'gtag(\'js\', new Date());',
  'gtag(\'config\', \'UA-120674089-1\');',
  '</script>'
)


for(thisFile in files){
  lines = readLines(thisFile)
  part1 = lines[1:43]
  part2 = lines[44:length(lines)]
  newLines = c(part1, trackingLines, part2)
  writeLines(newLines, thisFile)
}


