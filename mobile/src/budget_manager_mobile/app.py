import toga
from .model import totals, expenses_by_category, parse_amount


class BudgetMobile(toga.App):
	def startup(self):
		# Data stores
		self.incomes = []
		self.expenses = []

		# Income tab
		self.i_name = toga.TextInput(placeholder="Name")
		self.i_amount = toga.TextInput(placeholder="Amount")
		self.i_add = toga.Button("Add", on_press=self.add_income)
		self.i_table = toga.Table(headings=["Name", "Amount"], data=[])
		income_box = toga.Box(style=toga.style.Pack(direction=toga.style.pack.COLUMN))
		for w in (self.i_name, self.i_amount, self.i_add, self.i_table):
			income_box.add(w)

		# Expenses tab
		self.e_name = toga.TextInput(placeholder="Name")
		self.e_category = toga.TextInput(placeholder="Category")
		self.e_amount = toga.TextInput(placeholder="Amount")
		self.e_add = toga.Button("Add", on_press=self.add_expense)
		self.e_table = toga.Table(headings=["Name", "Category", "Amount"], data=[])
		expense_box = toga.Box(style=toga.style.Pack(direction=toga.style.pack.COLUMN))
		for w in (self.e_name, self.e_category, self.e_amount, self.e_add, self.e_table):
			expense_box.add(w)

		# Report tab
		self.r_income_total = toga.Label("")
		self.r_expense_total = toga.Label("")
		self.r_profit = toga.Label("")
		self.r_margin = toga.Label("")
		self.r_categories = toga.Table(headings=["Category", "Amount", "Percent"], data=[])
		report_box = toga.Box(style=toga.style.Pack(direction=toga.style.pack.COLUMN))
		for w in (
			toga.Label("Totals"),
			self.r_income_total,
			self.r_expense_total,
			self.r_profit,
			self.r_margin,
			toga.Label("Expense Categories"),
			self.r_categories,
		):
			report_box.add(w)

		# Simple section switcher (avoids OptionContainer on Android)
		self.income_box = income_box
		self.expense_box = expense_box
		self.report_box = report_box
		self.section = toga.Selection(items=["Income", "Expenses", "Report"], on_select=self.on_section_change)
		self.section.value = "Income"
		self.content = toga.Box(style=toga.style.Pack(direction=toga.style.pack.COLUMN))
		self.content.add(self.income_box)
		root = toga.Box(style=toga.style.Pack(direction=toga.style.pack.COLUMN))
		root.add(self.section)
		root.add(self.content)

		self.main_window = toga.MainWindow(title=self.formal_name)
		self.main_window.content = root
		self.main_window.show()
		self.update_report()

	# Actions
	def add_income(self, button):
		name = (self.i_name.value or "").strip()
		amt = parse_amount(self.i_amount.value)
		if name or amt:
			self.incomes.append({"name": name, "amount": amt})
			self.i_table.data.append([name, f"{amt:.2f}"])
			self.i_name.value = ""
			self.i_amount.value = ""
			self.update_report()

	def add_expense(self, button):
		name = (self.e_name.value or "").strip()
		cat = (self.e_category.value or "").strip()
		amt = parse_amount(self.e_amount.value)
		if name or cat or amt:
			self.expenses.append({"name": name, "category": cat, "amount": amt})
			self.e_table.data.append([name, cat, f"{amt:.2f}"])
			self.e_name.value = ""
			self.e_category.value = ""
			self.e_amount.value = ""
			self.update_report()

	def update_report(self):
		t = totals(self.incomes, self.expenses)
		self.r_income_total.text = f"Income Total: {t['income_total']:.2f}"
		self.r_expense_total.text = f"Expense Total: {t['expense_total']:.2f}"
		self.r_profit.text = f"Profit: {t['profit']:.2f}"
		self.r_margin.text = f"Profit Margin: {t['profit_margin']:.2f}%"
		# Categories table
		cats = expenses_by_category(self.expenses)
		self.r_categories.data.clear()
		for row in cats:
			self.r_categories.data.append([
				row["category"], f"{row['amount']:.2f}", f"{row['percent']:.1f}%",
			])

	def on_section_change(self, widget):
		# Swap displayed content based on selection
		selected = widget.value
		# Remove all existing children from content box
		for child in list(self.content.children):
			self.content.remove(child)
		if selected == "Income":
			self.content.add(self.income_box)
		elif selected == "Expenses":
			self.content.add(self.expense_box)
		else:
			self.content.add(self.report_box)


def main():
	return BudgetMobile("Budget Manager", "com.example.budget_manager_mobile")
