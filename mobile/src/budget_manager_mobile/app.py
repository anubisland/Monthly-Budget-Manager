import toga
from toga.style import Pack
from toga.style.pack import COLUMN

# Minimal mobile UI that reuses the command-line model indirectly.

def build(app):
	box = toga.Box(style=Pack(direction=COLUMN, padding=16, gap=8))
	box.add(toga.Label("Budget Manager", style=Pack(font_size=20)))
	box.add(toga.Label("Mobile preview – basic UI placeholder."))
	return box


def main():
	# App ID must match Briefcase package: com.example + .budget_manager_mobile
	return toga.App("Budget Manager", "com.example.budget_manager_mobile", startup=build)
