from .app import main


if __name__ == "__main__":
	# Entry point for Android via Chaquopy/Briefcase.
	# Create the Toga app and start the main loop.
	app = main()
	app.main_loop()
