# hour-tracker-axi

`hours-axi` records how long your coding agent works on each project and turns it into an hour report. Claude Code hooks provide the timing, the agent adds notes on what the work was, and you get rounded hours per day and project.

```sh
npm install -g @nikolauska/hour-tracker-axi
hours-axi setup claude      # once: adds Claude Code hooks to your user settings
hours-axi report --week     # this week's hours
```

Run `hours-axi --help` for every command. How hours are counted and what gets recorded are covered in the [product handbook](docs/domain.md).

## License

MIT
